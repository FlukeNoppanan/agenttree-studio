import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { ArrowRight, KeyRound, Network } from "lucide-react"
import { useAuth } from "@/auth"
import { GettingStarted } from "@/components/getting-started"
import { PageHeader } from "@/components/page-header"
import { ApiExamples, integrationOrigin } from "@/components/tree/api-examples"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"

const sections = ["overview", "credentials", "build", "resources", "test", "review", "outputs", "api", "versions", "integrations"] as const
const actions = {
 credentials: [["/secrets", "Secrets", "manage_secrets"], ["/providers", "Providers", "manage_providers_models"]],
 build: [["/trees", "Trees", "manage_trees_agents"], ["/templates", "Templates", "manage_trees_agents"]],
 resources: [["/tools", "Tools / MCP", "manage_tools_mcp"]],
 test: [["/trees", "Trees → Playground", "manage_trees_agents"], ["/executions", "Executions", "view_executions"]],
 review: [["/executions", "Execution Trace", "view_executions"]],
 outputs: [["/executions", "Final Result / Artifacts", "view_executions"]],
 api: [["/account?section=api-keys", "Account → API Keys", "use_trees"]],
 integrations: [["/trees", "Trees → Connect", "manage_trees_agents"]],
} as const
export function GettingStartedPage() {
 const { t } = useTranslation()
 const { can } = useAuth()
 const [origin, setOrigin] = useState<string | null>(null)
 useEffect(() => { let active = true; api.integrationConfig().then(value => { if(active) setOrigin(integrationOrigin(value.public_origin, window.location.origin)) }).catch(() => { if(active) setOrigin(integrationOrigin(null, window.location.origin)) }); return () => {active=false} }, [])
 return <div className="product-guide min-w-0">
  <PageHeader title={t("productGuide.title")} description={t("productGuide.intro")} />
  <div className="guide-layout">
   <nav aria-label={t("productGuide.contents")} className="guide-nav"><p>{t("productGuide.contents")}</p><a href="#quick-start">Quick Start</a>{sections.map((key,index) => <a key={key} href={"#guide-" + key}><span>{String(index+1).padStart(2,"0")}</span>{t("productGuide.sections." + key + ".title")}</a>)}</nav>
   <article className="min-w-0">
    <section className="guide-intro"><Network className="size-6 text-primary" /><p className="mt-3 text-sm font-semibold">BUILD → TEST → UNDERSTAND → INTEGRATE</p><p className="mt-2 text-sm text-muted-foreground">{t("productGuide.flow")}</p><div className="mt-4"><GettingStarted summaryOnly /></div></section>
    <details id="quick-start" className="guide-quick"><summary><strong>{t("productGuide.quick")}</strong><span className="block mt-1 text-xs text-muted-foreground">{t("productGuide.quickHelp")}</span></summary><div className="mt-5"><GettingStarted expanded /></div></details>
    {sections.map((key,index) => <section key={key} id={"guide-" + key} className="guide-section">
      <header className="flex items-baseline gap-3"><span className="font-mono text-xs text-primary">{String(index+1).padStart(2,"0")}</span><h2>{t("productGuide.sections." + key + ".title")}</h2></header>
      {(t("productGuide.sections." + key + ".paragraphs", {returnObjects:true}) as string[]).map((text,i) => <p key={i}>{text}</p>)}
      {key === "overview" && <ol className="guide-hierarchy" aria-label="Root to Manager to Specialist">{["Root", "Manager", "Specialist"].map(role => <li key={role} data-role={role.toLowerCase()}><Network className="size-4" /><strong>{role}</strong><ArrowRight className="size-3" /></li>)}</ol>}
      {key === "credentials" && <aside className="guide-callout"><h3><KeyRound className="size-4" />{t("productGuide.directionTitle")}</h3><p>{t("productGuide.providerDirection")}</p><p>{t("productGuide.appDirection")}</p><p>{t("baseline.keyDirection")}</p></aside>}
      {key === "review" && <div className="guide-callout"><p>{t("productGuide.reviewFlow")}</p><p>{t("baseline.trace.actions.rootRevise.help")}</p></div>}
      {key === "outputs" && <div className="guide-callout"><p>{t("productGuide.outputFlow")}</p></div>}
      {key in actions && <div className="mt-4 flex flex-wrap gap-2">{actions[key as keyof typeof actions].filter(([, ,permission]) => can(permission)).map(([href,label]) => <Button asChild key={href} variant="outline" size="sm"><Link to={href}>{label}<ArrowRight className="size-3.5" /></Link></Button>)}</div>}
      {key === "versions" && origin && <div className="mt-5 min-w-0 space-y-4"><ApiExamples origin={origin} treeId="TREE_ID" asyncApi /><ApiExamples origin={origin} treeId="TREE_ID" asyncApi={false} /></div>}
      {key === "integrations" && <p className="guide-callout">{t("baseline.integrationModes")}</p>}
    </section>)}
   </article>
  </div>
 </div>
}
