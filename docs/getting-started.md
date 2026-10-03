# Your first Tree Run

Open **Getting Started** from the sidebar at any time. The dedicated tutorial teaches the workflow; the Dashboard keeps a compact progress card alongside its operational overview. Existing resources and successful Runs remain reflected in progress.

## Welcome

Welcome appears when entering the authenticated Studio shell, including after login. Start the tutorial or continue to the Dashboard. Selecting a snooze does not navigate or apply it immediately: closing Welcome or pressing either action applies the selected preference.

- **This session:** stored in sessionStorage for the current tab's browser session; reload and logout/login retain it. A fresh independent tab/session may show Welcome. Browser session restoration follows the browser's sessionStorage behavior.
- **Today:** until the next local calendar midnight, using the browser's timezone.
- **3, 7 or 14 days:** exactly that many 24-hour intervals from dismissal.

There is no permanent dismissal. Snoozing never hides Getting Started or changes resource completion. With no snooze selected, the next Studio entry can show Welcome again. Preferences are per account and browser, with timestamp data under `agenttree-studio:welcome:v1:<user-id>` in localStorage and session suppression under the same key in sessionStorage. Invalid or unavailable storage is handled safely. No credentials are stored in these preferences.

## Tutorial

First, **Understand AgentTree** introduces Tree, Root, Manager, Specialist, Provider, Model and optional Tools. **I understand the basics** records only a tutorial acknowledgement. The remaining steps preserve the existing resource-derived progress:

1. **Connect an AI Provider.** A Provider connects Agents to an AI service. For services that require a credential, save it in **Secrets** first; the Provider dialog links there when you have permission. Add the Provider and let Studio test its connection, discover models and verify generation. A connected Provider with at least one verified usable model completes this step. Verification can continue for other models after the first becomes usable.
2. **Create a Tree.** Templates are the recommended starting point. Preview their Agent structure and Tool requirements. **Blank Tree** remains available for building your own structure manually.
3. **Configure Agents.** Select which Tree to configure. In the existing setup workspace, choose a default Provider and verified model and apply them to your Agents. Review capabilities and resolve required Tools. General Analysis includes a required artifact Tool that the existing setup flow can add. Finish setup when the backend reports readiness; both the Tree and its current version must be Ready.
4. **Run the Tree.** Select a granted Ready Tree to open Live View. Enter a task and start the Run. Studio stores the result and Execution Trace. The guide includes a link to a successful Run so you can inspect it.
5. **Explore Connect.** Select a granted Ready Tree to open Connect: recommended asynchronous API examples, the simple synchronous API, personal API Key management and authenticated incoming Webhooks. Visiting this page completes the guide's Connect step; creating an API Key or publishing an integration is not required.

Tree actions explain missing prerequisites when no eligible Tree exists. With one eligible Tree, its name is shown beside the action. With multiple eligible Trees, a picker requires an explicit selection and shows name, Template and backend readiness. The tutorial never chooses an arbitrary Tree.

The Root receives work and coordinates the Tree. Managers organize and delegate tasks, review results and request revisions. Specialists perform focused work. Capabilities describe suitable work; a model supplies AI generation. Tools are optional for a basic manually configured Tree, although individual Templates can require them. The runtime decides which Agents a task needs; every Run does not necessarily visit every Agent.

**Execution Trace** records what actually happened. **API Keys** authenticate external applications. Incoming **Webhook Triggers** start Runs, while outgoing **Webhook Result Destinations** send results to external services. These use the existing integration features; see [external integrations](external-integrations.md).

## Permissions and progress

Providers and Trees use existing workspace access rules. If you cannot configure resources, the guide explains which steps an administrator handles and links to your granted Trees in Account → Tree Access. Live View and Trace require execution-viewing permission; the guide does not grant permissions.

Progress comes from existing application data through `/api/dashboard/me`. Provider facts are visible only to accounts with Provider management permission. Configure completion uses existing backend Ready status. Successful Run completion uses completed Runs on currently granted Trees: non-admin accounts count their own Runs and older unowned synchronous Runs; administrators count the accessible workspace's successful Runs. No input, output, credentials or API Key values are included in these setup facts.

The mental-model acknowledgement and visited Ready Tree Connect IDs are saved in browser storage under `agenttree-studio:onboarding:v1:<user-id>`. The older collapse preference remains readable for compatibility, although the Dashboard now always uses the compact treatment. These preferences are specific to the account and browser; clearing storage or using another browser resets the tutorial acknowledgements. They have no authorization effect. Missing, corrupt or unavailable storage does not prevent using Studio.

English and Thai can be switched in the shell or Welcome without reloading. Technical terms remain recognizable and explanations are written for each language. Theme switching uses shared indigo accents and neutral Light/Dark surfaces throughout the existing UI.

The guide refreshes when opened, or with its Refresh action. It does not continuously poll your setup. Provider, Tree and Run state remains authoritative after reload. No onboarding database, chatbot or interactive spotlight tour is included.

For consistent English and Thai product terminology, see [UI language style guide](ui-language-style-guide.md).
