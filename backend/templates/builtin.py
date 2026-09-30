"""A small portable starter set with explicit per-Agent Tool requirements."""

from backend.schemas.template import TemplateDefinition


def _agent(key: str, agent_type: str, name: str, description: str,
           parent_key: str | None, capabilities: list[str], instruction: str,
           role: str | None = None) -> dict:
    return {
        "key": key,
        "agent_type": agent_type,
        "name": name,
        "role": role or name,
        "description": description,
        "parent_key": parent_key,
        "system_instruction": instruction,
        "capabilities": capabilities,
        "settings": {},
    }


def _definition(agents: list[dict], requirements: list[dict] | None = None,
                *, trigger: dict | None = None, output: dict | None = None) -> TemplateDefinition:
    return TemplateDefinition.model_validate({
        "schema_version": 2,
        "agents": agents,
        "tool_requirements": requirements or [],
        "trigger": trigger or {
            "trigger_type": "manual_form",
            "config": {"fields": [{"id": "request", "name": "Request", "type": "textarea", "required": True}]},
        },
        "output": output or {"output_type": "text", "delivery_type": "show_in_web", "config": {}},
        "metadata": {},
    })


BUILTIN_TEMPLATES: tuple[dict, ...] = (
    {
        "id": "builtin-blank",
        "name": "Blank Tree",
        "description": "A clean Root Agent starting point for a custom team.",
        "category": "general",
        "definition": _definition([
            _agent("root", "root", "Root Agent", "Receives work and reviews the final result.", None, [],
                   "Clarify the user's objective, coordinate the work assigned to Managers, and return a concise result grounded in their findings."),
        ]),
    },
    {
        "id": "builtin-general-analysis",
        "name": "General Analysis",
        "description": "Research a question, compare evidence, and deliver a reviewed answer.",
        "category": "analysis",
        "definition": _definition([
            _agent("root", "root", "Analysis Lead", "Frames the request and reviews the final analysis.", None,
                   ["analysis", "planning", "synthesis"], "Turn the request into clear questions. Coordinate research and synthesis, distinguish evidence from inference, and review the final answer for unsupported claims."),
            _agent("research", "manager", "Research Manager", "Collects evidence and identifies open questions.", "root",
                   ["research", "evidence review"], "Plan the research needed to answer the request. Delegate focused questions, track evidence quality, and report gaps to the Analysis Lead."),
            _agent("researcher", "specialist", "Research Specialist", "Finds relevant facts and records their sources.", "research",
                   ["research", "fact finding"], "Gather facts relevant to the assigned question. Preserve source details, separate direct evidence from assumptions, and report uncertainty."),
            _agent("synthesis", "manager", "Synthesis Manager", "Combines findings into a clear, qualified response.", "root",
                   ["synthesis", "quality review"], "Compare the findings, reconcile disagreements, and prepare a concise synthesis that keeps material caveats and open questions."),
            _agent("analyst", "specialist", "Analysis Specialist", "Tests conclusions against evidence and alternatives.", "synthesis",
                   ["analysis", "reasoning"], "Evaluate the evidence and competing explanations for the assigned question. Explain which conclusions follow and what remains uncertain."),
        ], [
            {"id": "final-artifact", "catalog_key": "artifact-output", "requirement": "required", "agent_ref": "analyst", "reason": "Save the reviewed analysis as a reusable run artifact."},
            {"id": "external-research", "catalog_key": "web-api-request", "requirement": "recommended", "agent_ref": "researcher", "reason": "Optional access to a configured, documented HTTP API."},
        ]),
    },
    {
        "id": "builtin-document-analysis",
        "name": "Document Analysis",
        "description": "Extract claims from supplied text, verify them, and prepare a concise brief.",
        "category": "documents",
        "definition": _definition([
            _agent("root", "root", "Document Lead", "Defines the review goal and approves the final brief.", None,
                   ["document analysis", "summarization"], "Clarify the requested review. Coordinate extraction and verification, preserve the source's meaning, and return only conclusions supported by the supplied material."),
            _agent("review", "manager", "Review Manager", "Coordinates extraction and source checking.", "root",
                   ["document review", "quality control"], "Divide the supplied material into reviewable questions. Compare extraction with the source and flag missing context or contradictions."),
            _agent("extract", "specialist", "Extraction Specialist", "Extracts claims, dates, entities, and key passages.", "review",
                   ["information extraction", "summarization"], "Extract the requested facts and concise supporting passages from the provided input. Do not invent missing content."),
            _agent("verify", "specialist", "Source Check Specialist", "Checks draft findings against the supplied material.", "review",
                   ["fact checking", "citation review"], "Check each finding against the supplied text. Preserve citations or locations when present and explicitly mark unsupported claims."),
        ], [
            {"id": "document-brief", "catalog_key": "artifact-output", "requirement": "required", "agent_ref": "verify", "reason": "Keep the checked brief with the run's artifacts."},
            {"id": "document-workspace", "catalog_key": "filesystem-workspace", "requirement": "recommended", "agent_ref": "extract", "reason": "A future workspace connector could read managed source documents."},
        ]),
    },
    {
        "id": "builtin-it-troubleshooting",
        "name": "IT Troubleshooting",
        "description": "Triage a reported issue, inspect likely causes, and outline safe next steps.",
        "category": "operations",
        "definition": _definition([
            _agent("root", "root", "Incident Lead", "Frames the incident and reviews recommendations.", None,
                   ["incident triage", "risk review"], "Clarify impact and urgency. Coordinate diagnosis and remediation planning, avoid unsupported certainty, and approve only proportionate and reversible next steps."),
            _agent("diagnosis", "manager", "Diagnostics Manager", "Organizes symptoms, evidence, and likely causes.", "root",
                   ["diagnostics", "root cause analysis"], "Separate observed symptoms from hypotheses. Ask for the evidence needed to narrow likely causes and report the confidence and impact of each."),
            _agent("symptoms", "specialist", "Symptom Analyst", "Structures observed symptoms and missing evidence.", "diagnosis",
                   ["log analysis", "symptom analysis"], "Analyze only the logs and symptoms supplied for this task. Identify relevant signals, time ranges, and evidence that would distinguish likely causes."),
            _agent("resolution", "manager", "Resolution Manager", "Reviews recovery steps for impact and order.", "root",
                   ["remediation planning", "change safety"], "Develop an ordered recovery plan. Prefer reversible changes, identify prerequisites and risks, and define a check for each step."),
            _agent("runbook", "specialist", "Runbook Specialist", "Drafts reversible, verifiable remediation steps.", "resolution",
                   ["runbook design", "validation"], "Write clear runbook steps with expected outcomes, verification, and rollback guidance. Never imply a change has been executed."),
        ], [
            {"id": "incident-runbook", "catalog_key": "artifact-output", "requirement": "required", "agent_ref": "runbook", "reason": "Store the reviewed runbook with the execution."},
            {"id": "incident-api", "catalog_key": "monitoring-observability", "requirement": "recommended", "agent_ref": "symptoms", "reason": "A future monitoring connector could provide read-only incident evidence."},
        ]),
    },
    {
        "id": "builtin-api-data-analysis",
        "name": "API & Data Analysis",
        "description": "Inspect an API response and summarize data with explicit validation steps.",
        "category": "engineering",
        "definition": _definition([
            _agent("root", "root", "Data Lead", "Clarifies the question and reviews the result.", None,
                   ["data analysis", "planning"], "Clarify the analytical goal and data source. Coordinate endpoint review and analysis, state assumptions, and review the final result for data limitations."),
            _agent("api", "manager", "API Manager", "Coordinates endpoint inspection and data checks.", "root",
                   ["api analysis", "data validation"], "Plan requests and validation checks for the supplied API. Delegate endpoint behavior and response analysis, and do not expose credentials in findings."),
            _agent("endpoint", "specialist", "Endpoint Specialist", "Reviews endpoint behavior and response structure.", "api",
                   ["api analysis", "schema review"], "Use only the configured API Tool and its permitted endpoint. Inspect response shape, status, and relevant fields; report errors without retrying destructive operations."),
            _agent("analyst", "specialist", "Data Analyst", "Summarizes patterns and notes limitations.", "api",
                   ["data analysis", "statistical reasoning"], "Analyze the returned data for requested patterns. Explain validation steps, sample limits, assumptions, and conclusions that the data does not support."),
        ], [
            {"id": "api-request", "catalog_key": "web-api-request", "requirement": "required", "agent_ref": "endpoint", "reason": "A configured HTTP endpoint is needed to retrieve the requested data."},
            {"id": "analysis-artifact", "catalog_key": "artifact-output", "requirement": "recommended", "agent_ref": "analyst", "reason": "Save the validated analysis as a run artifact."},
            {"id": "database-source", "catalog_key": "database-access", "requirement": "recommended", "agent_ref": "endpoint", "reason": "Database-specific connectors are not available in this version."},
        ]),
    },
)
