"""Current pointer owns deletion locks; history retains identity and outputs."""
from datetime import datetime, timezone
from uuid import uuid4
import json
from qualification_fixture import QUALIFIED_METADATA

import pytest
from sqlalchemy import select, text

from backend.models.provider import ProviderConnection, ProviderModel
from backend.models.run import Run, TraceEvent, RunArtifact
from backend.models.secret import Secret
from backend.models.tool import ToolConnection, ToolAssignment
from backend.models.tree import AgentConfig, Tree, TreeVersion
from backend.schemas.provider import ProviderUpdate
from backend.schemas.secret import SecretCreate
from backend.schemas.tree import ToolAssignmentDraft
from backend.services.dependency_service import DependencyService
from backend.services.errors import ResourceConflictError, ServiceError
from backend.services.provider_service import ProviderService
from backend.services.secret_service import SecretService
from backend.services.tool_service import ToolService
from backend.services.tree_service import TreeService
from tests.test_trees import connected_provider, valid_payload


def alternate(database):
    p=ProviderConnection(name='Replacement Provider',provider_type='ollama',base_url='http://localhost:11434',status='connected')
    database.add(p); database.flush()
    database.add(ProviderModel(provider_connection_id=p.id,model_id='discovered-model',qualification_status='qualified',metadata_json=QUALIFIED_METADATA))
    database.commit()
    return p


def enable_fk(database):
    database.execute(text('PRAGMA foreign_keys=ON'))


def rotate(database, a, b, *, tools=None):
    if tools:
        for provider in (a, b):
            secret = SecretService(database).create(SecretCreate(
                name=f"Tool-capable test key {uuid4().hex[:4]}", secret_type="api_key", value="test-key",
            ))
            provider.provider_type = "groq"
            provider.secret_id = secret.id
        database.commit()
    payload=valid_payload(a)
    if tools:
        payload.tool_assignments=[ToolAssignmentDraft(agent_config_id=payload.agents[-1].id,tool_connection_id=tools[0].id)]
    service=TreeService(database)
    tree=service.create(payload)
    assert service.validate(tree.id,mark_ready=True).valid
    for agent in payload.agents: agent.provider_connection_id=b.id
    if tools: payload.tool_assignments[0].tool_connection_id=tools[1].id
    current=service.replace_ready_configuration(tree.id,payload)
    return service,tree,current,payload


def test_historical_provider_deletion_preserves_original_identity_and_current_readiness(database):
    enable_fk(database)
    a=connected_provider(database); b=alternate(database)
    service,old,current,_=rotate(database,a,b)
    assert DependencyService(database).provider(a.id).can_delete
    ProviderService(database).delete(a.id)
    database.expire_all()
    history=service.get_version(old.id,old.current_version_id)
    assert history.id != current.current_version_id
    for agent in history.agents:
        assert agent.provider_connection_id is None
        assert agent.provider_reference.id==a.id
        assert agent.provider_reference.name=='Test Provider'
        assert agent.provider_reference.deleted
        assert agent.model_id=='discovered-model'
    assert service.validate(old.id).valid
    assert all(agent.provider_connection_id==b.id for agent in service.get(old.id).version.agents)
    with pytest.raises(ResourceConflictError): ProviderService(database).delete(b.id)


@pytest.mark.parametrize('role',['root','manager','specialist'])
def test_any_current_agent_blocks_even_with_many_historical_versions(database,role):
    a=connected_provider(database); b=alternate(database)
    service,old,current,payload=rotate(database,a,b)
    for agent in payload.agents:
        if agent.agent_type==role: agent.provider_connection_id=a.id
    service.replace_ready_configuration(old.id,payload)
    deps=DependencyService(database).provider(a.id)
    assert not deps.can_delete and len(deps.dependencies)==1
    assert deps.dependencies[0].agent_type==role
    assert deps.dependencies[0].tree_version==3
    with pytest.raises(ResourceConflictError): ProviderService(database).delete(a.id)


def test_second_tree_current_binding_blocks_until_its_rotation(database):
    enable_fk(database)
    a=connected_provider(database); b=alternate(database)
    service,first,_,_=rotate(database,a,b)
    payload=valid_payload(a); payload.name='Second Tree'
    second=service.create(payload); service.validate(second.id,mark_ready=True)
    deps=DependencyService(database).provider(a.id)
    assert {d.tree_id for d in deps.dependencies}=={second.id}
    with pytest.raises(ResourceConflictError): ProviderService(database).delete(a.id)
    for agent in payload.agents: agent.provider_connection_id=b.id
    service.replace_ready_configuration(second.id,payload)
    ProviderService(database).delete(a.id)
    assert service.validate(first.id).valid and service.validate(second.id).valid


def test_current_pointer_not_highest_version_is_authoritative(database):
    a=connected_provider(database); b=alternate(database)
    service,old,current,_=rotate(database,a,b)
    database.get(Tree,old.id).current_version_id=old.current_version_id
    database.commit(); database.expire_all()
    assert not DependencyService(database).provider(a.id).can_delete
    assert DependencyService(database).provider(b.id).can_delete
    with pytest.raises(ResourceConflictError): ProviderService(database).delete(a.id)


@pytest.mark.parametrize('kind',['artifact','http_api','mcp'])
def test_historical_tool_and_mcp_removed_without_losing_bindings_or_identity(database,kind):
    enable_fk(database)
    a=connected_provider(database); b=alternate(database)
    tools=[]
    for name in ['Historical Tool','Current Tool']:
        tool=ToolConnection(name=name,tool_type=kind,status='connected',enabled=True,
                            discovered_tools_json=[{'name':'safe_read','selected':True}] if kind=='mcp' else [],
                            config_json={})
        database.add(tool); tools.append(tool)
    database.commit()
    service,old,current,_=rotate(database,a,b,tools=tools)
    assert DependencyService(database).tool(tools[0].id).can_delete
    ToolService(database).delete(tools[0].id); database.expire_all()
    history=service.get_version(old.id,old.current_version_id)
    assert len(history.tool_assignments)==1
    ref=history.tool_assignments[0]
    assert ref.tool_connection_id==tools[0].id and ref.tool_reference.deleted
    assert ref.tool_reference.name=='Historical Tool'
    assert service.validate(old.id).valid
    with pytest.raises(ResourceConflictError): ToolService(database).delete(tools[1].id)
    assert database.scalar(select(ToolAssignment).where(ToolAssignment.tree_version_id==history.id)).tool_connection_id is None


def test_secret_rotation_uses_live_resource_binding_not_tree_history(database):
    a=connected_provider(database)
    secrets=[Secret(name=n,secret_type='api_key',encrypted_value='never-copy-ciphertext') for n in ['A','B']]
    database.add_all(secrets); database.commit()
    a.secret_id=secrets[0].id; database.commit()
    with pytest.raises(ResourceConflictError): SecretService(database).delete(secrets[0].id)
    tree=TreeService(database).create(valid_payload(a))
    a.secret_id=secrets[1].id; database.commit()
    SecretService(database).delete(secrets[0].id)
    with pytest.raises(ResourceConflictError): SecretService(database).delete(secrets[1].id)
    stored=database.get(AgentConfig,tree.version.agents[0].id).provider_identity_json
    assert set(stored)=={'id','name','resource_type'}
    assert 'never-copy-ciphertext' not in json.dumps(stored)


def test_historical_execution_trace_result_artifact_survive_provider_and_tool_removal(database):
    enable_fk(database)
    a=connected_provider(database); b=alternate(database)
    service,old,_,_=rotate(database,a,b)
    now=datetime.now(timezone.utc)
    run=Run(tree_id=old.id,tree_version_id=old.current_version_id,status='completed',input_json={'objective':'audit'},output_json={'content':'preserved'},started_at=now)
    database.add(run); database.flush()
    database.add(TraceEvent(run_id=run.id,sequence=1,event_type='completed',payload_json={'answer':'preserved'}))
    artifact=RunArtifact(run_id=run.id,core_artifact_id=str(uuid4()),artifact_type='text',name='report.txt',operation='create',media_type='text/plain',size_bytes=9,sha256='a'*64,producer_role='root',body_available=False,created_at=now)
    database.add(artifact); database.commit()
    ProviderService(database).delete(a.id); database.expire_all()
    assert database.get(Run,run.id).output_json=={'content':'preserved'}
    assert database.get(TraceEvent,database.scalar(select(TraceEvent.id))).run_id==run.id
    assert database.get(RunArtifact,artifact.id).name=='report.txt'
    assert database.get(TreeVersion,old.current_version_id)


def test_deleted_historical_binding_cannot_be_silently_reused_as_current_configuration(database):
    enable_fk(database)
    a=connected_provider(database); b=alternate(database)
    service,old,current,payload=rotate(database,a,b)
    ProviderService(database).delete(a.id)
    payload.agents[-1].provider_connection_id=a.id
    with pytest.raises(ServiceError,match='missing provider'):
        service.replace_ready_configuration(old.id,payload)
    assert service.get(old.id).current_version_id==current.current_version_id


def test_tool_assignment_management_never_rewrites_history(database):
    from backend.schemas.tool import ToolAssignmentsUpdate
    a=connected_provider(database); b=alternate(database)
    tools=[]
    for name in ['Shared Artifact','Replacement Artifact']:
        tool=ToolConnection(name=name,tool_type='artifact',status='connected',enabled=True,config_json={})
        database.add(tool); tools.append(tool)
    database.commit()
    service,old,current,_=rotate(database,a,b,tools=tools)
    manager=next(agent for agent in current.version.agents if agent.agent_type=='manager')
    ts=ToolService(database)
    assert ts.get(tools[0].id).assigned_agents_count==0
    assert ts.assignments(tools[0].id).assignments==[]
    old_agent=service.get_version(old.id,old.current_version_id).agents[-1]
    with pytest.raises(ServiceError,match='historical Agent'):
        ts.replace_assignments(tools[0].id,ToolAssignmentsUpdate(agent_ids=[old_agent.id]))
    ts.replace_assignments(tools[0].id,ToolAssignmentsUpdate(agent_ids=[manager.id]))
    assert ts.get(tools[0].id).assigned_agents_count==1
    ts.replace_assignments(tools[0].id,ToolAssignmentsUpdate(agent_ids=[]))
    assert len(service.get_version(old.id,old.current_version_id).tool_assignments)==1
    assert ts.get(tools[0].id).assigned_agents_count==0
    assert DependencyService(database).tool(tools[0].id).can_delete
