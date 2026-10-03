import { CircleHelp, Network } from "lucide-react"
import { Link, useLocation } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { AccountMenu } from "@/components/account-menu"
import { LanguageSelect } from "@/components/language-select"
import { ThemeToggle } from "@/components/theme-toggle"

const contexts: Record<string, string> = {
  trees: "nav.trees", runs: "consolidation.executions", executions: "consolidation.executions", templates: "nav.templates",
  providers: "nav.providers", tools: "nav.tools", secrets: "nav.secrets",
  "execution-trace": "consolidation.executions", "security-events": "audit.title",
  users: "auth.users", settings: "nav.settings", account: "accountUx.myAccount",
  "getting-started": "onboarding.title", learning: "nav.learning",
}

export function AppTopbar() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const context = contexts[pathname.split("/")[1]] ?? "nav.dashboard"
  return <header className="app-topbar" aria-label={t("integrationPolish.utilities")}>
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <Network className="size-4 shrink-0 text-primary lg:hidden" aria-hidden="true" />
      <span className="hidden shrink-0 text-muted-foreground md:inline">AgentTree Studio</span>
      <span className="hidden text-border-strong md:inline" aria-hidden="true">/</span>
      <span className="truncate font-medium">{t(context)}</span>
    </div>
    <div className="flex shrink-0 items-center gap-2">
      <Link to="/getting-started" className="flex h-9 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={t("onboarding.title")} title={t("onboarding.title")}>
        <CircleHelp className="size-4" aria-hidden="true" /><span className="hidden xl:inline">{t("onboarding.title")}</span>
      </Link>
      <div className="w-[94px]"><LanguageSelect compact /></div>
      <ThemeToggle />
      <AccountMenu compact placement="below" />
    </div>
  </header>
}
