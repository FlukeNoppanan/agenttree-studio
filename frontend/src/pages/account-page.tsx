import { useEffect, useState, type KeyboardEvent } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useSearchParams } from "react-router-dom"

import { useAuth } from "@/auth"
import { PageHeader } from "@/components/page-header"
import { ApiKeysPanel } from "@/components/account/api-keys-panel"
import { Button } from "@/components/ui/button"
import { CardTitle } from "@/components/ui/card"
import { api, type AccountInfo } from "@/lib/api"

type AccountSection = "profile" | "security" | "tree-access" | "api-keys"
const sections: AccountSection[] = ["profile", "security", "tree-access", "api-keys"]

function Info({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border py-3 text-sm last:border-0"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>
}

export function AccountPage() {
  const { t, i18n } = useTranslation()
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const requested = params.get("section")
  const section: AccountSection = sections.includes(requested as AccountSection) ? requested as AccountSection : "profile"
  const [account, setAccount] = useState<AccountInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    void api.account().then(value => { if (active) setAccount(value) })
      .catch(() => { if (active) setError(true) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  function select(next: AccountSection) { setParams({ section: next }) }
  function tabKeys(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index
    if (event.key === "ArrowRight") next = (index + 1) % sections.length
    else if (event.key === "ArrowLeft") next = (index + sections.length - 1) % sections.length
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = sections.length - 1
    else return
    event.preventDefault()
    select(sections[next])
    document.getElementById(`account-tab-${sections[next]}`)?.focus()
  }
  async function logout() { try { await api.logout() } finally { setUser(null); navigate("/login", { replace: true }) } }
  const date = (value: string | null | undefined) => value ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : t("common.never")
  const role = account?.user.is_primary_admin ? t("accountUx.primaryAdmin") : account?.user.is_admin ? t("accountUx.administrator") : t("accountUx.user")

  return <div className="mx-auto max-w-5xl space-y-6">
    <PageHeader title={t("accountUx.myAccount")} description={t("dashboardUx.signedInAs", { username: user?.username })} />
    <div role="tablist" aria-label={t("accountV2.sections")} className="studio-tabs">
      {sections.map((item, index) => <button key={item} id={`account-tab-${item}`} type="button" role="tab" aria-selected={section === item} aria-controls="account-panel" tabIndex={section === item ? 0 : -1} onClick={() => select(item)} onKeyDown={event => tabKeys(event, index)} className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${section === item ? "text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>{t(`accountV2.tabs.${item}`)}</button>)}
    </div>
    {loading ? <p role="status" className="text-muted-foreground">{t("accountV2.loading")}</p> : error || !account ? <p role="alert" className="text-destructive">{t("accountV2.loadError")}</p> : <div id="account-panel" role="tabpanel" aria-labelledby={`account-tab-${section}`}>
      {section === "profile" && <section className="min-w-0"><div className="py-4"><CardTitle>{t("accountUx.profile")}</CardTitle></div><div><dl><Info label={t("auth.username")} value={account.user.username} /><Info label={t("accountUx.accountType")} value={role} /><Info label={t("accountUx.accountStatus")} value={t(account.user.is_active ? "auth.active" : "auth.inactive")} /><Info label={t("accountV2.created")} value={date(account.user.created_at)} /><Info label={t("accountUx.lastLogin")} value={date(account.user.last_login_at)} /></dl></div></section>}
      {section === "security" && <section className="min-w-0"><div className="py-4"><CardTitle>{t("accountUx.security")}</CardTitle></div><div className="space-y-5"><dl><Info label={t("accountUx.lastLogin")} value={date(account.user.last_login_at)} /><Info label={t("accountUx.sessionExpires")} value={date(account.session_expires_at)} /></dl><div className="flex flex-wrap gap-2"><Button onClick={() => navigate("/change-password")}>{t("auth.changePassword")}</Button><Button variant="outline" onClick={() => void logout()}>{t("auth.signOut")}</Button></div><p className="text-xs text-muted-foreground">{t("accountV2.passwordNotice")}</p></div></section>}
      {section === "tree-access" && <section className="min-w-0"><div className="py-4"><CardTitle>{t("accountV2.tabs.tree-access")}</CardTitle></div><div className="space-y-4">{account.user.is_admin ? <><p className="font-medium">{t("accountV2.adminAccess")}</p><p className="text-sm text-muted-foreground">{t("accountV2.adminAccessHelp")}</p></> : !(["manage_trees_agents", "use_trees", "view_executions"] as const).some(permission => account.user.permissions.includes(permission)) ? <p className="text-muted-foreground">{t("accountV2.noTreePermission")}</p> : <><p className="font-medium">{t(account.user.tree_access_mode === "all" ? "accountV2.allTrees" : "accountV2.selectedTrees")}</p><p className="text-sm text-muted-foreground">{t("accountV2.availableCount", { count: account.allowed_trees.length })}</p>{account.user.tree_access_mode === "all" && <p className="text-sm text-muted-foreground">{t("accountV2.futureTrees")}</p>}</>}{account.allowed_trees.length ? <ul className="resource-list">{account.allowed_trees.map(tree => <li key={tree.id} className="py-3 text-sm font-medium">{tree.name}</li>)}</ul> : <p className="text-sm text-muted-foreground">{t("accountV2.noTrees")}</p>}<p className="text-xs text-muted-foreground">{t("accountV2.adminManaged")}</p></div></section>}
      {section === "api-keys" && <ApiKeysPanel enabled={account.user.is_admin || account.user.permissions.includes("use_trees")} canManageTrees={account.user.is_admin || account.user.permissions.includes("manage_trees_agents")} />}
    </div>}
  </div>
}
