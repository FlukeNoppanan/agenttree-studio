"""Deterministic configuration and error boundaries discovered by real runtime audit."""
from uuid import uuid4

import pytest
from agenttree.core.execution_runtime import ExecutionFailed
from backend.services.runtime_builder import RuntimeBuilder
from backend.services.tree_service import TreeService
from backend.services.run_service import RunService
from backend.schemas.run import RunErrorCode
from backend.services.errors import ServiceError
from tests.test_trees import connected_provider, valid_payload


def collaboration_payload(database):
    provider = connected_provider(database)
    payload = valid_payload(provider)
    root, first, specialist = payload.agents
    second = first.model_copy(update={'id': str(uuid4()), 'name': 'Second Manager'})
    payload.agents += [second, specialist.model_copy(update={'id': str(uuid4()), 'parent_agent_id': second.id})]
    first.settings = {'review_enabled': True, 'allowed_manager_peer_ids': [second.id]}
    second.settings = {'allowed_manager_peer_ids': [first.id]}
    return payload


@pytest.mark.parametrize('target', ['self', 'root', 'specialist', 'unknown', 'malformed', 'wrong_type', 'duplicate'])
def test_collaboration_same_version_contract_in_preview_ready_and_runtime(database, target):
    payload = collaboration_payload(database)
    targets = {'self': [payload.agents[1].id], 'root': [payload.agents[0].id],
               'specialist': [payload.agents[2].id], 'unknown': [str(uuid4())],
               'malformed': [None], 'wrong_type': 'manager', 'duplicate': [payload.agents[3].id] * 2}
    payload.agents[1].settings['allowed_manager_peer_ids'] = targets[target]
    service = TreeService(database)
    preview = service.preview_draft(payload)
    assert not preview.valid
    assert any(issue.code == 'manager_peers_invalid' and issue.agent_id == payload.agents[1].id for issue in preview.errors)
    tree = service.create(payload)
    assert not service.validate(tree.id, mark_ready=True).valid
    assert service.get(tree.id).status == 'draft'
    runtime = RuntimeBuilder(database).validate(tree.id)
    assert any(issue.code == 'TREE_INVALID' and 'collaboration' in issue.message for issue in runtime.errors)


def test_valid_peers_remapped_across_ready_versions_and_preserve_snapshot(database):
    service = TreeService(database)
    payload = collaboration_payload(database)
    tree = service.create(payload)
    assert service.validate(tree.id, mark_ready=True).valid
    original = service.get_version(tree.id)
    edited = service.replace_ready_configuration(tree.id, payload)
    managers = [a for a in edited.version.agents if a.agent_type == 'manager']
    assert all(a.settings['allowed_manager_peer_ids'] == [next(b.id for b in managers if b.id != a.id)] for a in managers)
    assert RuntimeBuilder(database).validate(tree.id).valid
    assert service.get_version(tree.id, original.id) == original
    # A second save must use current references, not accumulate historical IDs.
    payload.agents = [a for a in edited.version.agents]
    edited2 = service.replace_ready_configuration(tree.id, payload)
    ids = {a.id for a in edited2.version.agents if a.agent_type == 'manager'}
    assert all(set(a.settings['allowed_manager_peer_ids']) == ids - {a.id} for a in edited2.version.agents if a.agent_type == 'manager')


def test_deleted_or_role_changed_peer_cannot_be_marked_ready(database):
    payload = collaboration_payload(database)
    deleted = payload.agents[3].id
    payload.agents = [a for a in payload.agents if a.id != deleted and a.parent_agent_id != deleted]
    assert not TreeService(database).preview_draft(payload).valid
    payload = collaboration_payload(database)
    changed = payload.agents[3]
    payload.agents = [a for a in payload.agents if a.parent_agent_id != changed.id]
    changed.agent_type = 'specialist'
    changed.parent_agent_id = payload.agents[1].id
    assert not TreeService(database).preview_draft(payload).valid


def test_invalid_ready_replacement_rolls_back_peer_configuration(database):
    payload = collaboration_payload(database)
    service = TreeService(database)
    tree = service.create(payload)
    service.validate(tree.id, mark_ready=True)
    before = service.get(tree.id)
    payload.agents[1].settings['allowed_manager_peer_ids'] = [str(uuid4())]
    with pytest.raises(ServiceError, match='collaboration'):
        service.replace_ready_configuration(tree.id, payload)
    assert service.get(tree.id) == before


@pytest.mark.parametrize('qualification,available,candidate', [('unknown', True, True), ('unavailable', False, True), ('qualified', True, False)])
def test_runtime_and_builder_reject_unusable_discovered_models(database, qualification, available, candidate):
    from backend.models.provider import ProviderModel
    from sqlalchemy import select
    payload = valid_payload(connected_provider(database))
    tree = TreeService(database).create(payload)
    model = database.scalar(select(ProviderModel))
    model.qualification_status, model.is_available, model.generation_candidate = qualification, available, candidate
    database.commit()
    assert not TreeService(database).validate(tree.id).valid
    assert any(e.code == 'MODEL_NOT_AVAILABLE' for e in RuntimeBuilder(database).validate(tree.id).errors)


@pytest.mark.parametrize('failure,expected', [('ProviderTimeoutError', 'PROVIDER_TIMEOUT'), ('ProviderAuthenticationError', 'PROVIDER_AUTH_ERROR'), ('ProviderModelNotFoundError', 'PROVIDER_MODEL_NOT_FOUND'), ('ProviderInvalidRequestError', 'PROVIDER_INVALID_REQUEST'), ('ProviderRateLimitError', 'PROVIDER_RATE_LIMIT')])
def test_background_safe_failure_classification_is_valid_api_enum(failure, expected):
    code, message = RunService._safe_execution_error(ExecutionFailed(failure))
    assert code == expected
    assert RunErrorCode(code)
    assert 'SECRET_SENTINEL' not in message


def test_structured_decision_failure_has_safe_actionable_message():
    code, message = RunService._safe_execution_error(ExecutionFailed('DecisionOutputError'))
    assert code == 'EXECUTION_ERROR'
    assert 'structured decision' in message


def test_collaboration_template_roundtrip_uses_new_manager_ids(database):
    from backend.models.auth import User
    from backend.schemas.template import TemplateMetadataCreate
    from backend.services.template_service import TemplateService
    owner = User(username='runtime-template-owner', username_key='runtime-template-owner', password_hash='unused', is_admin=True)
    database.add(owner)
    database.commit()
    tree = TreeService(database).create(collaboration_payload(database))
    template = TemplateService(database).create_from_tree(
        tree.id, TemplateMetadataCreate(name='Portable collaboration'), owner)
    created = TemplateService(database).instantiate(template.id, owner)
    detail = TreeService(database).get(created.id)
    managers = [a for a in detail.version.agents if a.agent_type == 'manager']
    assert all(a.settings['allowed_manager_peer_ids'] == [next(b.id for b in managers if b.id != a.id)] for a in managers)
    assert not any(e.code == 'manager_peers_invalid' for e in TreeService(database).validate(created.id).errors)


def test_failed_final_review_has_safe_inspection_guidance():
    code, message = RunService._safe_execution_error(ExecutionFailed('FinalReviewFailed'))
    assert code == 'EXECUTION_ERROR'
    assert 'final review' in message and 'Execution Trace' in message
