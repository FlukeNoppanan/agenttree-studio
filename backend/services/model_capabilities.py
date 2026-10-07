"""Shared role gating for readiness and runtime; qualification is evidence."""
import json

ROLE_CHECKS = {
    "root": ("structured_output", "root_planning", "triage", "final_review"),
    "manager": ("structured_output", "decomposition", "manager_review"),
    "specialist": (),
}


def supports_agent_role(model, role: str) -> bool:
    if role not in ROLE_CHECKS or not (model.is_available and model.generation_candidate
                                      and model.qualification_status in {"qualified", "limited"}):
        return False
    try:
        metadata = json.loads(model.metadata_json or "{}")
    except (TypeError, ValueError):
        return False
    evidence = metadata.get("agenttree_qualification") if isinstance(metadata, dict) else None
    # Legacy successful text-generation checks certify only Specialist output.
    if evidence is None:
        return role == "specialist"
    if not isinstance(evidence, dict) or evidence.get("version") != 1 or evidence.get("generation") != "passed":
        return False
    checks = evidence.get("checks")
    return isinstance(checks, dict) and all(
        isinstance(checks.get(name), dict) and checks[name].get("status") == "passed"
        for name in ROLE_CHECKS[role]
    )
