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
            {"id": "document-workspace", "catalog_key": "filesystem-workspace", "requirement": "recommended", "agent_ref": "extract", "reason": "Optional file access through an explicitly configured Filesystem MCP server and allowed directories."},
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


def _starter(key: str, name: str, description: str, category: str, difficulty: str,
             workstreams: list[tuple[str, str, str, list[tuple[str, str, str]]]],
             *, outcome: str, input_hint: str, artifact: bool = False) -> dict:
    """Reuse the portable hierarchy; each workstream has a distinct responsibility."""
    agents = [_agent('root', 'root', f'{name} Lead', 'Coordinates the request and performs final review.', None,
                     ['planning', 'synthesis'],
                     f'Coordinate the supplied task across the configured Managers. {outcome} '
                     'Separate evidence from assumptions. Do not claim external access or executed changes without a configured Tool.')]
    for manager_key, manager_name, capability, specialists in workstreams:
        agents.append(_agent(manager_key, 'manager', manager_name,
                             f'Plans, delegates and reviews {capability} work.', 'root', [capability],
                             f'Delegate focused {capability} tasks to your Specialists. Review their output for accuracy, scope and missing evidence; request bounded revisions when needed.'))
        for specialist_key, specialist_name, instruction in specialists:
            agents.append(_agent(specialist_key, 'specialist', specialist_name, instruction,
                                 manager_key, [capability], instruction))
    requirements = []
    if artifact:
        target = workstreams[-1][-1][-1][0]
        requirements.append({'id': 'report-artifact', 'catalog_key': 'artifact-output',
                             'requirement': 'required', 'agent_ref': target,
                             'reason': 'Create a reusable text report with the existing Artifact Tool.'})
        agents[-1]['system_instruction'] += ' Use the assigned Artifact Tool to create a concise text report; never claim a file exists unless the Tool succeeded.'
    definition = _definition(agents, requirements)
    definition.metadata = {'difficulty': difficulty, 'outcome': outcome, 'input_hint': input_hint,
                           'scope': 'supplied-input',
                           'setup': 'Choose a connected AI Provider and a verified Model for every Agent. ' +
                           ('Assign Artifact Output to the report Specialist.' if artifact else 'No Tool is required for the supplied-text workflow.')}
    return {'id': f'builtin-{key}', 'name': name, 'description': description,
            'category': category, 'definition': definition}


# Difficulty describes setup and team complexity, not runtime quality or a score.
for _item in BUILTIN_TEMPLATES:
    _item['definition'].metadata.update({
        'difficulty': 'beginner' if _item['id'] == 'builtin-blank' else 'intermediate',
        'setup': 'Choose a connected AI Provider and verified Model for every Agent. Resolve required Tool slots before testing.',
        'scope': 'configured-resources' if _item['id'] == 'builtin-api-data-analysis' else 'supplied-input',
    })

BUILTIN_TEMPLATES += (
    _starter('quick-summary', 'Quick Summary', 'Turn supplied text into a short, checked summary.', 'general', 'beginner',
             [('summary', 'Summary Manager', 'summarization', [('summarizer', 'Summary Specialist', 'Summarize only the supplied text. Keep key facts, caveats and decisions; do not add outside facts.')])],
             outcome='Return a brief summary and important caveats.', input_hint='Paste the text and specify the desired length.'),
    _starter('concept-explainer', 'Concept Explainer', 'Explain a technical concept with examples and clear limits.', 'education', 'beginner',
             [('explanation', 'Explanation Manager', 'explanation', [('explainer', 'Explanation Specialist', 'Explain the requested concept for the stated audience. Use one concrete example, define prerequisites and mark uncertain claims.')])],
             outcome='Return a clear explanation, example and limitations.', input_hint='Name a concept and the audience’s experience.'),
    _starter('compare-options', 'Compare Options', 'Compare supplied options against explicit criteria.', 'analysis', 'beginner',
             [('comparison', 'Comparison Manager', 'comparison', [('comparator', 'Comparison Specialist', 'Compare the supplied alternatives using the user’s criteria. Identify missing information and trade-offs without inventing prices or specifications.')])],
             outcome='Return a comparison table and conditional recommendation.', input_hint='Provide options, criteria and known constraints.'),
    _starter('structured-brief', 'Structured Brief', 'Extract a consistent brief from supplied notes.', 'documents', 'beginner',
             [('brief', 'Brief Manager', 'information extraction', [('extractor', 'Brief Specialist', 'Extract facts, decisions, owners, deadlines and open questions from the supplied notes. Mark unknown fields explicitly.')])],
             outcome='Return a structured brief with facts, actions and open questions.', input_hint='Paste meeting or project notes; specify the fields needed.'),
    _starter('content-draft', 'Content Draft & Review', 'Draft content and review it against an audience and brief.', 'content', 'intermediate',
             [('editorial', 'Editorial Manager', 'content review', [('writer', 'Draft Specialist', 'Write a draft for the stated audience, purpose and tone using the supplied facts.'), ('editor', 'Editorial Specialist', 'Review the brief and supplied draft material for clarity, unsupported claims and tone; provide concrete corrections.')])],
             outcome='Return the final draft with a short editorial checklist.', input_hint='Provide the purpose, audience, facts and preferred tone.'),
    _starter('incident-text-triage', 'Incident Text Triage', 'Organize supplied incident evidence without live monitoring claims.', 'operations', 'intermediate',
             [('triage', 'Triage Manager', 'incident analysis', [('evidence', 'Evidence Specialist', 'Extract timestamps, affected services, observed impact and signals from supplied incident text.'), ('hypotheses', 'Hypothesis Specialist', 'Rank possible explanations against supplied evidence. Suggest safe verification steps; do not claim live service access or applied remediation.')])],
             outcome='Return observed facts, hypotheses, missing evidence and safe next checks.', input_hint='Paste incident notes or logs. Remove sensitive data first.'),
    _starter('technical-qa', 'Technical Q&A Review', 'Check a technical answer against supplied requirements.', 'engineering', 'intermediate',
             [('quality', 'Technical Review Manager', 'technical validation', [('answer', 'Answer Specialist', 'Propose an answer to the technical question using supplied context. State assumptions.'), ('check', 'Verification Specialist', 'Check the proposed approach against supplied requirements, edge cases and constraints. Distinguish verified facts from suggested tests.')])],
             outcome='Return a reviewed answer, assumptions and verification steps.', input_hint='Provide the question, context and acceptance criteria.'),
    _starter('design-review', 'Software Design Review', 'Review a supplied design from reliability and maintainability perspectives.', 'engineering', 'advanced',
             [('reliability', 'Reliability Manager', 'reliability review', [('failure', 'Failure Analysis Specialist', 'Review the supplied design for failure paths, data consistency and recovery; do not claim to have run code.')]),
              ('maintenance', 'Maintainability Manager', 'maintainability review', [('boundaries', 'Interface Review Specialist', 'Review interfaces, coupling and change impact. Propose bounded improvements with migration and testing considerations.')])],
             outcome='Synthesize a prioritized design review with trade-offs and verification recommendations.', input_hint='Paste a design or code excerpt and constraints.'),
    _starter('decision-board', 'Decision Board', 'Review a decision through benefits, risks and practical constraints.', 'analysis', 'advanced',
             [('benefits', 'Benefits Manager', 'benefit analysis', [('value', 'Value Specialist', 'Assess the supplied options against explicit goals, benefits and evidence.')]),
              ('risks', 'Risk Manager', 'risk analysis', [('risk', 'Risk Specialist', 'Identify uncertainties, failure modes, reversibility and evidence needed to choose responsibly.')])],
             outcome='Return a decision memo with alternatives, rationale, risks and conditions for revisiting it.', input_hint='Provide a decision, options, goals and constraints.'),
    _starter('operations-plan', 'Operations Change Plan', 'Plan a proposed change with verification and rollback, without executing it.', 'operations', 'advanced',
             [('planning', 'Change Planning Manager', 'change planning', [('steps', 'Planning Specialist', 'Draft ordered change steps, prerequisites and ownership from supplied context. Never imply the steps have been executed.')]),
              ('safety', 'Change Safety Manager', 'change safety', [('rollback', 'Rollback Specialist', 'Review risks, validation gates and rollback conditions for the proposed change. Identify missing evidence.')])],
             outcome='Return a reviewed plan with prerequisites, checks, rollback and unresolved questions.', input_hint='Describe the proposed change, environment constraints and rollback requirements.'),
    _starter('research-report', 'Research Report Artifact', 'Synthesize supplied sources and preserve a reviewed report as an Artifact.', 'research', 'advanced',
             [('evidence', 'Evidence Manager', 'evidence analysis', [('sources', 'Source Specialist', 'Compare supplied sources, record citations present in the input and identify contradictions. Do not claim web research without a configured Tool.')]),
              ('report', 'Report Manager', 'report writing', [('reporter', 'Report Specialist', 'Prepare an evidence-based report with sources, uncertainty and conclusions.')])],
             outcome='Return a reviewed synthesis and a persisted report Artifact.', input_hint='Paste source excerpts, citation labels and a research question.', artifact=True),
)
