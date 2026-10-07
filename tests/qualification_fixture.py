"""Explicit complete contract evidence for runtime tests using fake models."""
import json

QUALIFIED_METADATA = json.dumps({"agenttree_qualification": {
    "version": 1, "generation": "passed",
    "checks": {name: {"status": "passed"} for name in (
        "structured_output", "root_planning", "triage", "decomposition", "manager_review", "final_review")},
    "roles": {role: "passed" for role in ("root", "manager", "specialist")},
    "tool_calling": "not_tested",
}})
