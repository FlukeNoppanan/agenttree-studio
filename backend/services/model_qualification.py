"""Small, synthetic compatibility probes using the actual Core strategies.

Evidence describes tested contracts, not a guarantee for arbitrary tasks or Tools.
No user input, credentials or raw model output is persisted here.
"""

from dataclasses import replace
from copy import deepcopy

from agenttree import ManagerAgent, RootAgent, Task
from agenttree.core import ProviderTaskTriage, ProviderTaskDecomposer, ProviderManagerReviewer, ProviderFinalReviewer
from agenttree.core.root import ProviderRootPlanner
from agenttree.core.structured_output import normalize_decision_output, collect_decision_diagnostics
from agenttree.exceptions import DecisionOutputError
from agenttree.models import AgentResult, ExecutionTrace, ReviewDecision, Subtask, TriageResult, ExecutionMode
from agenttree.orchestration.models import SpecialistExecution, TaskManagerReviewResult, ManagerReviewStatus, ExecutionStatus
from agenttree.providers import BaseProvider, ProviderConfig, ProviderRequest

EVIDENCE_KEY = "agenttree_qualification"
EVIDENCE_VERSION = 1


class QualificationProvider(BaseProvider):
    """Keep the real adapter boundary and deterministic, bounded probe requests."""

    def __init__(self, delegate):
        super().__init__(getattr(delegate, "config", ProviderConfig("qualification")))
        self.delegate = delegate
        self.traffic_managed = getattr(delegate, "traffic_managed", False)
        self.observations = []

    @property
    def capabilities(self):
        return getattr(self.delegate, "capabilities", super().capabilities)

    def generate(self, request):
        observation = {"request_mode": (request.response_format or {}).get("type", "prompt_json"),
                       "response_received": False}
        self.observations.append(observation)
        try:
            response = self.delegate.generate(replace(request, temperature=0, max_tokens=2048,
                metadata={**request.metadata, "purpose": "studio_model_qualification"}))
        except Exception as error:
            diagnostic = getattr(error, "diagnostics", {})
            if isinstance(diagnostic, dict):
                for key in ("response_received", "final_content_present", "reasoning_present"):
                    if isinstance(diagnostic.get(key), bool):
                        observation[key] = diagnostic[key]
            raise
        observation.update(response_received=True,
                           final_content_present=bool(response.content or response.structured_content),
                           reasoning_present=response.metadata.get("reasoning_present") is True)
        return response


def qualify_decisions(delegate, previous: dict | None = None) -> dict:
    provider = QualificationProvider(delegate)
    evidence = {"version": EVIDENCE_VERSION, "generation": "passed", "checks": {}, "roles": {}, "tool_calling": "not_tested"}
    # Delegation capability is a Deep-mode contract. A valid Fast direct answer
    # does not demonstrate this responsibility and must not bias the probe.
    task = Task(id="qualification-task", execution_mode=ExecutionMode.DEEP, objective="Compare option A (cost 10, duration 2 days) with option B (cost 20, duration 1 day). Delegate the comparison to the comparison Manager and its Specialist. Recommend an option and explain the tradeoff.")
    root = RootAgent(id="qualification-root", name="Comparison Root")
    manager = ManagerAgent(id="qualification-manager", name="Comparison Manager", capabilities=("comparison",))
    subtask = Subtask(id="qualification-subtask", parent_task_id=task.id, manager_id=manager.id, objective=task.objective, required_capabilities=("comparison",))
    triage = TriageResult(task.id, task.objective, required_capabilities=("comparison",))

    def structured():
        request = ProviderRequest(prompt='Return JSON only: {"probe":"agenttree"}', response_format={"type": "json_object"} if provider.capabilities.structured_output is True else None)
        response = provider.generate(request)
        representation = response.structured_content if response.structured_content is not None else response.content
        normalized, representation_name = normalize_decision_output(representation)
        provider.observations[-1]["representation"] = representation_name
        if normalized.get("probe") != "agenttree":
            raise DecisionOutputError("Synthetic probe mismatch", reason_code="probe_mismatch")

    def planning():
        if not ProviderRootPlanner(provider).plan(task, root).delegate:
            raise DecisionOutputError("Delegation probe not exercised", reason_code="delegation_not_exercised")

    def routing():
        value = ProviderTaskTriage(provider).triage(task, available_capabilities=("comparison",))
        if value.required_capabilities != ("comparison",):
            raise DecisionOutputError("Routing probe not exercised", reason_code="routing_not_exercised")

    def decomposition():
        items = ProviderTaskDecomposer(provider).decompose(task, manager, triage, available_capabilities=("comparison",))
        if not items or any(item.required_capabilities != ("comparison",) for item in items):
            raise DecisionOutputError("Specialist routing probe not exercised", reason_code="routing_not_exercised")

    def manager_review():
        execution = SpecialistExecution(subtask_id=subtask.id, specialist_id="qualification-specialist", status=ExecutionStatus.COMPLETED, agent_result=AgentResult(agent_id="qualification-specialist", success=True, output="Option A costs 10 and takes 2 days. Option B costs 20 and takes 1 day. Prefer A when cost matters; B when speed matters."))
        return ProviderManagerReviewer(provider).review(task, subtask, manager, (execution,))

    def final_review():
        reviewed = TaskManagerReviewResult(task_id=task.id, manager_results=(), status=ManagerReviewStatus.PASSED, trace=ExecutionTrace(task_id=task.id))
        # Tests schema/enum/feedback validation. Does not require PASS for an
        # empty overall result, nor misrepresent it as a full runtime success.
        return ProviderFinalReviewer(provider).review(task, root, reviewed)

    for name, probe in [("structured_output", structured), ("root_planning", planning), ("triage", routing), ("decomposition", decomposition), ("manager_review", manager_review), ("final_review", final_review)]:
        prior = previous.get("checks", {}).get(name) if isinstance(previous, dict) and previous.get("version") == EVIDENCE_VERSION and previous.get("generation") == "passed" else None
        if isinstance(prior, dict) and prior.get("status") == "passed":
            evidence["checks"][name] = deepcopy(prior)
            continue
        provider.observations.clear()
        events = []
        try:
            with collect_decision_diagnostics() as events:
                probe()
        except DecisionOutputError as error:
            evidence["checks"][name] = {"status": "failed", "reason_code": error.reason_code}
            if error.field_name in {"objective", "required_capabilities", "subtasks", "decision", "feedback", "delegate", "direct_output"}:
                evidence["checks"][name]["field"] = error.field_name
        except Exception as error:
            from backend.services.model_discovery_service import _qualification_failure, failure_policy
            status, code, _ = _qualification_failure(error)
            evidence["checks"][name] = {"status": "interrupted" if status == "transient_error" else "failed", "reason_code": code}
            if status == "transient_error":
                scope, retry_after, fatal = failure_policy(error)
                evidence["checks"][name].update(failure_scope=scope, retry_after=retry_after, fatal=fatal)
            # Provider-wide transport/auth/rate failures should not cause a
            # barrage of further probes or become a negative capability claim.
            if status == "transient_error":
                break
        else:
            evidence["checks"][name] = {"status": "passed"}
        finally:
            check = evidence["checks"].get(name)
            if check is not None:
                normalized = [event for event in events if event["event"] == "normalized"]
                check["diagnostics"] = {
                    "requests": list(provider.observations),
                    "repair_attempted": any(event["event"] == "repair.started" for event in events),
                    "repair_result": next((event["event"].split(".")[-1] for event in reversed(events)
                                          if event["event"] in {"repair.succeeded", "repair.failed"}), "not_attempted"),
                    "representation": normalized[-1].get("representation") if normalized else
                                      next((item.get("representation") for item in provider.observations if item.get("representation")), None),
                    "validation": "passed" if normalized or check["status"] == "passed" else "failed" if check["status"] == "failed" else "not_completed",
                }
    for role, requirements in {"root": ["structured_output", "root_planning", "triage", "final_review"], "manager": ["structured_output", "decomposition", "manager_review"], "specialist": []}.items():
        evidence["roles"][role] = "passed" if all(evidence["checks"].get(name, {}).get("status") == "passed" for name in requirements) else "not_qualified"
    return evidence
