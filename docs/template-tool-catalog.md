# Templates, Tools and MCP

Templates are starting configurations for the ordinary AgentTree Tree model. They are not installers, data sources, or a separate execution engine. Every created Tree uses the same Builder, readiness, Playground, Execution and Connect infrastructure.

## Choose a starting point

| Level | Templates | Setup |
| --- | --- | --- |
| Beginner | Blank Tree, Quick Summary, Concept Explainer, Compare Options, Structured Brief | Choose a connected AI Provider and a verified Model for each Agent. Blank Tree is a deliberately incomplete starting point. The other four work from supplied input without requiring a Tool. |
| Intermediate | General Analysis, Document Analysis, IT Troubleshooting, API & Data Analysis, Content Draft & Review, Incident Text Triage, Technical Q&A Review | Complete Provider/Model bindings. General Analysis, Document Analysis and IT Troubleshooting require Artifact Output; API & Data Analysis requires a configured HTTP Tool. Other Tool suggestions are optional. |
| Advanced | Software Design Review, Decision Board, Operations Change Plan, Research Report Artifact | Multiple Managers review distinct workstreams. Research Report Artifact requires Artifact Output on its report Specialist. The other three analyze supplied input without requiring external access. |

Difficulty describes configuration and hierarchy complexity. It is not a guarantee of answer quality or an instruction to the runtime to force delegation. Root may answer a simple request directly. Manager Review and Root Final Review follow the runtime's existing delegation/review semantics.

Search by name or capability and filter by category or difficulty. Preview shows the team, intended outcome, input guidance and required/recommended Tools. **Use Template opens directly in Visual Builder** with an unsaved configuration. Canceling before saving does not create a Tree.

Templates contain portable Agent references and requirement keys. They do not include a user's Provider, Model, credentials, or installed Tool connection. Bind those explicitly, resolve required slots and use backend readiness before starting a Run. Optional resources do not block a supplied-input workflow. A Template definition alone is not a live dependency that prevents resource deletion.

## Catalog state means capability, not connectivity

| State | Entries | Meaning |
| --- | --- | --- |
| Ready | Artifact Output | Existing Run-scoped Tool adapter. No remote connection or credential is required; assign it to the intended Specialist. |
| Setup required | Web/API Request, Generic MCP Server, GitHub Account API | Existing adapter requiring a real endpoint/server and, when appropriate, a Secret. Test the actual configuration. |
| Catalog addable | Filesystem MCP, Fetch MCP, Knowledge Graph MCP | Curated external server registration guidance. Software must be managed separately and available to the backend. |
| Coming soon | Database, Monitoring / Observability | No executable package is included. These entries do not claim a working integration. |

Provider credentials belong in **Secrets**. AgentTree **API Keys** authenticate an external application to Studio; they are not Provider credentials. Do not place credentials in prompts, Template metadata or catalog descriptions.

## What MCP + / Configure does

It opens the existing Tool configuration flow for registering a server. **It does not install software locally.** Saving registration is not the same as successfully connecting. Testing/discovery contacts the configured server, and permitted individual Tools must be selected explicitly before use.

- **Streamable HTTP:** Studio connects to the configured existing server URL. Review server authentication and network access separately.
- **stdio:** the backend launches the configured command with its configured arguments/environment. The command must exist inside the backend container, and allowed directories must be mounted/accessible there. Studio does not silently install a package or grant a filesystem path. A user-configured command such as `npx` can itself perform package resolution; that behavior belongs to the configured command and must be reviewed by the administrator.

Review the official server setup and its access scope before registering:

- [Filesystem MCP](https://github.com/modelcontextprotocol/servers/blob/main/src/filesystem/README.md): allowed directories can expose read/write/move operations. Prefer dedicated directories and select read-only Tools when writes are unnecessary. Never expose credential directories or the entire host home directory for a demo.
- [Fetch MCP](https://github.com/modelcontextprotocol/servers/blob/main/src/fetch/README.md): performs network requests. Returned content is untrusted. Do not put credentials into requested URLs.
- [Knowledge Graph MCP](https://github.com/modelcontextprotocol/servers/blob/main/src/memory/README.md): reads and changes external graph records, including persistence owned by that server. It does not add conversation memory to AgentTree Core. Use a dedicated external data location and review write/delete access.

Registration retains its catalog profile identifier so matching Template slots can use the actual configured profile. Matching does not rely on display names, and connectivity/readiness is still checked independently.

## Resource lifecycle

Current Tree configuration determines whether a Provider or Tool/MCP is in use. An old Tree version retains non-secret identity evidence but does not permanently lock an otherwise unused resource. Deleting a historical-only resource preserves the version, Execution, Trace, final result and Artifact records. Historical views identify a removed resource rather than substituting a new one.

Secrets have live references from Providers, Tools and Result Destinations. Rotate those references before deleting an old Secret. Current references remain protected. A deleted resource is not restored automatically; configure a valid binding and satisfy readiness before using a new current configuration.
