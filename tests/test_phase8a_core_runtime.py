"""Phase 8A Studio-to-Core runtime integration contracts."""

from qualification_fixture import QUALIFIED_METADATA

from datetime import datetime, timezone
from types import SimpleNamespace
from threading import Event

from agenttree import AgentTree, AgentTreeConfig, ManagerAgent, RootAgent, SpecialistAgent, Task
from agenttree.core import (ProviderRootSynthesizer, RuleBasedTaskTriage,
                            StaticFinalReviewer, StaticManagerReviewer,
                            StaticTaskDecomposer)
from agenttree.models import ArtifactRef, ArtifactType, ExecutionEvent, FileIntent, SubtaskTemplate
from agenttree.providers import BaseProvider, ProviderCapabilities, ProviderConfig, ProviderResponse, ProviderStreamChunk
from agenttree.providers import ProviderRateLimitError, ProviderTimeoutError
from agenttree.tools import ToolBindingRegistry, ToolExecutor, ToolRegistry
from sqlalchemy import func, select

from backend.models.provider import ProviderConnection, ProviderModel
from backend.models.run import Run, RunArtifact, TraceEvent
from backend.models.tree import AgentConfig
from backend.services.core_runtime import StudioAgentTreeRuntime
from backend.services.run_service import RunService
from backend.services.runtime_builder import RuntimeBuilder, RuntimeBundle
from backend.api.public_v2 import artifact_read
from tests.test_runs import ScriptedProvider, runtime_tree, scripted_builder


class WaitingProvider(BaseProvider):
    def __init__(self, started: Event, release: Event):
        super().__init__(ProviderConfig("phase8a-stream", model="fixture"))
        self.started, self.release = started, release

    @property
    def capabilities(self):
        return ProviderCapabilities(streaming=True, tool_calling=True)

    def generate(self, request):
        raise AssertionError("native streaming must be used")

    def generate_stream(self, request):
        yield ProviderStreamChunk(delta_text="live")
        self.started.set()
        self.release.wait(5)
        yield ProviderStreamChunk(delta_text=" output")
        yield ProviderStreamChunk(response=ProviderResponse("live output", self.name))


def streaming_bundle(started: Event, release: Event) -> RuntimeBundle:
    root = RootAgent(id="root", name="Root")
    manager = ManagerAgent(id="manager", name="Manager", capabilities=("manage",))
    worker = SpecialistAgent(id="worker", name="Worker", capabilities=("work",))
    tree = AgentTree(root_agent=root,
        triage=RuleBasedTaskTriage({}, fallback_capabilities=("manage",)),
        decomposer=StaticTaskDecomposer((SubtaskTemplate("work", ("work",)),)),
        manager_reviewer=StaticManagerReviewer(), final_reviewer=StaticFinalReviewer(),
        config=AgentTreeConfig(provider_streaming=True))
    tree.register_manager(manager); tree.register_specialist(manager, worker)
    provider = WaitingProvider(started, release)
    tree.register_provider(provider); tree.bind_provider(worker, provider)
    tools, bindings = ToolRegistry(), ToolBindingRegistry()
    return RuntimeBundle(tree, SimpleNamespace(id="tree"), SimpleNamespace(id="version"),
                         {root.id: root, manager.id: manager, worker.id: worker}, (),
                         tools, bindings, ToolExecutor(registry=tools, bindings=bindings))


def test_studio_runtime_emits_live_delta_while_nonterminal_and_supports_cancellation():
    started, release = Event(), Event()
    runtime = StudioAgentTreeRuntime(max_workers=1, max_pending=1)
    run_id = "phase8a-live-run"
    handle = runtime.submit(run_id, streaming_bundle(started, release),
                            Task(id=run_id, objective="stream"))
    output = handle.stream_output(timeout=5)
    first = next(output)
    assert first.delta == "live" and started.is_set()
    assert handle.status().state.value == "running"
    status = runtime.cancel(run_id)
    release.set()
    assert status.state.value in {"cancellation_requested", "cancelled"}
    try:
        handle.result(timeout=5)
    except Exception:
        pass
    assert handle.status().state.value == "cancelled"
    runtime.release(run_id); runtime.shutdown()


def test_builder_uses_captured_tree_version_and_binds_every_role(database):
    tree, _, ids = runtime_tree(database)
    captured = tree.version.id
    builder, providers, _ = scripted_builder(database)
    bundle = builder.build(tree.id, captured)
    assert bundle.version.id == captured
    assert bundle.runtime.root_agent.id == ids[0]
    assert set(bundle.runtime.provider_bindings) == set(ids)
    assert all(bundle.runtime.model_bindings[agent_id] == "runtime-model" for agent_id in ids)
    assert providers and bundle.runtime.root_agent.description == "Be decisive."
    assert isinstance(bundle.runtime._root_synthesizer, ProviderRootSynthesizer)


def test_builder_preserves_mixed_provider_and_model_routing(database):
    tree, first_provider, ids = runtime_tree(database)
    secret_id = first_provider.secret_id
    configs = {agent_id: database.get(AgentConfig, agent_id) for agent_id in ids}
    expected: dict[str, tuple[str, str]] = {}
    for agent_id, provider_type, model_id in (
        (ids[0], "gemini", "gemini-model"),
        (ids[1], "groq", "groq-model"),
        (ids[2], "openrouter", "openrouter-model"),
    ):
        connection = ProviderConnection(
            name=provider_type, provider_type=provider_type, secret_id=secret_id,
            status="connected",
        )
        database.add(connection); database.flush()
        database.add(ProviderModel(
            provider_connection_id=connection.id, model_id=model_id,
            is_available=True, qualification_status="qualified", metadata_json=QUALIFIED_METADATA,
        ))
        configs[agent_id].provider_connection_id = connection.id
        configs[agent_id].model_id = model_id
        expected[agent_id] = (connection.id, model_id)
    database.commit()

    created = {}
    def factory(connection, model, credential, runtime_name):
        created[connection.id] = ScriptedProvider(runtime_name, model)
        return created[connection.id]

    bundle = RuntimeBuilder(database, provider_factory=factory).build(tree.id, tree.version.id)
    assert set(created) == {item[0] for item in expected.values()}
    for agent_id, (connection_id, model_id) in expected.items():
        assert bundle.runtime.provider_bindings[agent_id] == created[connection_id].name
        assert bundle.runtime.model_bindings[agent_id] == model_id


def test_builder_maps_directional_manager_collaboration_and_keeps_specialists_isolated(database):
    tree, provider, ids = runtime_tree(database)
    first_manager = database.get(AgentConfig, ids[1])
    second_manager = AgentConfig(tree_version_id=tree.version.id, agent_type="manager",
        name="Peer", parent_agent_id=ids[0], provider_connection_id=provider.id,
        model_id="runtime-model", capabilities_json=["network"])
    database.add(second_manager); database.flush()
    second_worker = AgentConfig(tree_version_id=tree.version.id, agent_type="specialist",
        name="Peer worker", parent_agent_id=second_manager.id,
        provider_connection_id=provider.id, model_id="runtime-model",
        capabilities_json=["log-analysis"])
    database.add(second_worker)
    first_manager.settings_json = {"allowed_manager_peer_ids": [second_manager.id]}
    database.commit()
    bundle = scripted_builder(database)[0].build(tree.id, tree.version.id)
    assert bundle.runtime.manager_permissions[first_manager.id] == (second_manager.id,)
    assert second_manager.id not in bundle.runtime.manager_permissions
    assert all(agent.id not in bundle.runtime.manager_permissions
               for agent in bundle.runtime.specialists)


def test_root_runtime_limits_and_safe_provider_error_categories(database):
    tree, _, ids = runtime_tree(database)
    root = database.get(AgentConfig, ids[0])
    root.settings_json = {"max_manager_revisions": 3, "max_final_revisions": 0,
        "max_tool_rounds": 4, "max_tool_calls": 9,
        "max_collaboration_messages_per_manager": 5,
        "max_collaboration_messages_total": 14, "provider_streaming": False}
    database.commit()
    bundle = scripted_builder(database)[0].build(tree.id, tree.version.id)
    config = bundle.runtime.config
    assert config.max_manager_revisions == 3 and config.max_final_revisions == 0
    assert config.max_tool_rounds == 4 and config.max_tool_calls == 9
    assert config.max_collaboration_messages_per_manager == 5
    assert config.max_collaboration_messages_total == 14
    assert config.provider_streaming is False
    assert RunService._safe_execution_error(ProviderRateLimitError("secret-body")) == (
        "PROVIDER_RATE_LIMIT", "Provider rate limit exceeded")
    assert RunService._safe_execution_error(ProviderTimeoutError("secret-body")) == (
        "PROVIDER_TIMEOUT", "Provider request timed out")


def test_core_event_ingestion_is_ordered_and_idempotent(database):
    tree, _, _ = runtime_tree(database)
    run = Run(tree_id=tree.id, tree_version_id=tree.version.id, status="running",
              input_json={}, metadata_json={}, started_at=datetime.now(timezone.utc))
    database.add(run); database.commit()
    bundle = scripted_builder(database)[0].build(tree.id, tree.version.id)
    records = [SimpleNamespace(sequence=index, event=ExecutionEvent(
        task_id=run.id, event_type=kind, actor_id=bundle.runtime.root_agent.id))
        for index, kind in enumerate(("tool.completed", "manager.collaboration.responded",
                                      "artifact.committed", "execution.completed"), start=1)]
    service = RunService(database)
    service._ingest_core_events(run, records, bundle)
    service._ingest_core_events(run, records[1:], bundle)
    database.commit()
    stored = database.scalars(select(TraceEvent).where(TraceEvent.run_id == run.id)
                              .order_by(TraceEvent.core_sequence)).all()
    assert [item.core_sequence for item in stored] == [1, 2, 3, 4]
    assert [item.event_type for item in stored] == [item.event.event_type for item in records]


def test_artifact_metadata_is_scoped_to_its_run_and_never_applied(database):
    tree, _, _ = runtime_tree(database)
    run = Run(tree_id=tree.id, tree_version_id=tree.version.id, status="completed",
              input_json={}, metadata_json={}, started_at=datetime.now(timezone.utc))
    other = Run(tree_id=tree.id, tree_version_id=tree.version.id, status="completed",
                input_json={}, metadata_json={}, started_at=datetime.now(timezone.utc))
    database.add_all((run, other)); database.commit()
    first = ArtifactRef("a" * 64, run.id, ArtifactType.PATCH, "fix-v1", "src/fix.py",
        FileIntent.MODIFY, "text/x-diff", "utf-8", 10, "c" * 64,
        datetime.now(timezone.utc), "specialist", "worker", None, {"round": 1})
    ref = ArtifactRef("d" * 64, run.id, ArtifactType.PATCH, "fix-v2", "src/fix.py",
        FileIntent.MODIFY, "text/x-diff", "utf-8", 12, "b" * 64,
        datetime.now(timezone.utc), "specialist", "worker", None,
        {"round": 2, "supersedes_artifact_id": first.artifact_id})
    RunService(database)._persist_artifacts(
        run, SimpleNamespace(artifacts=(ref,)), (), artifact_history=(first, ref),
    )
    database.commit()
    artifacts = RunService(database).artifact_metadata(run.id)
    assert [(item.core_artifact_id, item.is_final) for item in artifacts] == [
        (first.artifact_id, False), (ref.artifact_id, True),
    ]
    assert RunService(database).artifact_metadata(other.id) == ()
    assert database.scalar(select(func.count()).select_from(RunArtifact)) == 2
    stored = database.scalar(select(RunArtifact).where(RunArtifact.core_artifact_id == ref.artifact_id))
    assert artifact_read(stored).supersedes_artifact_id == first.artifact_id
