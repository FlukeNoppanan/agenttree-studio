import { useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { api, type Permission, type StudioUser, type TreeAccessMode, type TreeListItem } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import { CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

const permissionOptions: Permission[] = ["manage_trees_agents", "manage_secrets", "manage_providers_models", "manage_tools_mcp", "view_executions"]

export function UsersPage() {
  const { t } = useTranslation()
  const [users, setUsers] = useState<StudioUser[]>([])
  const [trees, setTrees] = useState<TreeListItem[]>([])
  const [selected, setSelected] = useState<StudioUser | null>(null)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [admin, setAdmin] = useState(false)
  const [active, setActive] = useState(true)
  const [grants, setGrants] = useState<Permission[]>([])
  const [treeIds, setTreeIds] = useState<string[]>([])
  const [treeAccessMode, setTreeAccessMode] = useState<TreeAccessMode>("selected")
  const [treeSearch, setTreeSearch] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void Promise.all([api.listUsers(), api.listTrees()])
      .then(([userRows, treeRows]) => { setUsers(userRows); setTrees(treeRows) })
      .catch(() => setError(t("errors.generic")))
      .finally(() => setLoading(false))
  }, [t])

  function choose(user: StudioUser | null) {
    setSelected(user); setUsername(user?.username ?? ""); setPassword(""); setConfirmation("")
    setAdmin(user?.is_admin ?? false); setActive(user?.is_active ?? true)
    setGrants(user?.permissions ?? []); setTreeIds(user?.allowed_tree_ids ?? []); setTreeAccessMode(user?.tree_access_mode ?? "selected"); setTreeSearch(""); setError("")
  }

  function toggle<T>(values: T[], item: T, setter: (next: T[]) => void) {
    setter(values.includes(item) ? values.filter(value => value !== item) : [...values, item])
  }

  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return; setError("")
    if (password && password !== confirmation) { setError(t("auth.passwordMismatch")); return }
    setBusy(true)
    try {
      const result = selected
        ? await api.updateUser(selected.id, { is_admin: selected.is_primary_admin ? true : admin, is_active: selected.is_primary_admin ? true : active, permissions: grants, allowed_tree_ids: treeIds, tree_access_mode: treeAccessMode })
        : await api.createUser({ username, password, is_admin: admin, permissions: grants, allowed_tree_ids: treeIds, tree_access_mode: treeAccessMode })
      if (selected && password) await api.resetUserPassword(selected.id, password)
      setUsers(current => [...current.filter(user => user.id !== result.id), result].sort((a, b) => a.username.localeCompare(b.username)))
      choose(null)
    } catch { setError(t("auth.saveFailed")) }
    finally { setBusy(false) }
  }

  async function remove() {
    if (busy || !selected || selected.is_primary_admin || !window.confirm(t("auth.confirmDelete"))) return
    setBusy(true)
    try { await api.deleteUser(selected.id); setUsers(current => current.filter(item => item.id !== selected.id)); choose(null) }
    catch { setError(t("auth.saveFailed")) }
    finally { setBusy(false) }
  }

  const role = (user: StudioUser) => user.is_primary_admin ? t("accountUx.primaryAdmin") : user.is_admin ? t("accountUx.administrator") : t("accountUx.user")
  const accessLabel = (user: StudioUser) => user.is_admin ? t("auth.allTrees") : !user.permissions.includes("use_trees") ? t("auth.noTreeAccess") : user.tree_access_mode === "all" ? t("auth.allTrees") : t("auth.selectedCount", { count: user.allowed_tree_ids.length })
  const visibleTrees = trees.filter(tree => tree.name.toLocaleLowerCase().includes(treeSearch.trim().toLocaleLowerCase()))
  function selectAllVisible() {
    const ids = visibleTrees.map(tree => tree.id)
    setTreeIds(current => ids.every(id => current.includes(id)) ? current.filter(id => !ids.includes(id)) : [...new Set([...current, ...ids])])
  }
  return <div className="space-y-6">
    <PageHeader title={t("auth.users")} description={t("usersV2.description")} action={<Button onClick={() => choose(null)}>{t("auth.createUser")}</Button>} />
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
      <section className="min-w-0"><div className="py-4"><CardTitle>{t("auth.users")}</CardTitle></div><div className="space-y-2">
        {loading && <p role="status" className="text-sm text-muted-foreground">{t("common.loading")}</p>}
        {!loading && !users.length && <p className="text-sm text-muted-foreground">{t("usersV3.empty")}</p>}
        {users.map(user => <button key={user.id} type="button" onClick={() => choose(user)} aria-pressed={selected?.id === user.id} className={`flex w-full items-center justify-between gap-3 border-b py-3 px-2 text-left transition-colors hover:border-primary/30 hover:bg-secondary/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${selected?.id === user.id ? "border-primary/40 bg-secondary/50" : "border-border"}`}><span className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary font-semibold text-primary">{user.username.slice(0, 1).toUpperCase()}</span><span className="min-w-0"><span className="block truncate font-medium">{user.username}</span><span className="block text-xs text-muted-foreground">{role(user)}{user.is_primary_admin ? ` · ${t("accountUx.fullAccess")}` : ` · ${t("usersV3.permissionCount", { count: user.permissions.filter(permission => permission !== "use_trees").length })}`}</span><span className="block text-xs text-muted-foreground">{t("auth.treeAccess")}: {accessLabel(user)}</span></span></span><span className="shrink-0 text-xs text-muted-foreground">{t(user.is_active ? "auth.active" : "auth.inactive")}</span></button>)}
      </div></section>
      <section className="min-w-0"><div className="py-4"><CardTitle>{t(selected ? "auth.editUser" : "auth.createUser")}</CardTitle></div><div>
        <form onSubmit={save} className="space-y-5">
          <label className="block text-sm">{t("auth.username")}<Input required disabled={!!selected} value={username} onChange={event => setUsername(event.target.value)} /></label>
          <label className="block text-sm">{selected ? t("auth.resetPassword") : t("auth.password")}<Input type="password" minLength={12} required={!selected} value={password} onChange={event => setPassword(event.target.value)} /></label>
          <label className="block text-sm">{t("auth.confirmPassword")}<Input type="password" minLength={12} required={!selected || !!password} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
          <div className="flex gap-6"><label className="flex items-center gap-2"><input type="checkbox" disabled={selected?.is_primary_admin} checked={admin} onChange={event => setAdmin(event.target.checked)} />{t("accountUx.administrator")}</label>{selected && !selected.is_primary_admin && <label className="flex items-center gap-2"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} />{t("auth.active")}</label>}</div>
          <fieldset disabled={admin} className="space-y-2"><legend className="font-semibold">{t("auth.permissions")}</legend>{permissionOptions.map(permission => <label key={permission} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={admin || grants.includes(permission)} onChange={() => toggle(grants, permission, setGrants)} />{t(`auth.permission.${permission}`)}</label>)}</fieldset>
          <fieldset className="space-y-3 border-t border-border pt-4"><legend className="font-semibold">{t("auth.treeAccess")}</legend>
            {admin ? <p className="text-sm text-muted-foreground">{t("auth.allTrees")} — {t("accountUx.administrator")}</p> : <><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={grants.includes("use_trees")} onChange={() => toggle(grants, "use_trees", setGrants)} />{t("usersV3.canUseTrees")}</label>{!grants.includes("use_trees") ? <p className="text-sm text-muted-foreground">{t("auth.noTreeAccess")}</p> : <>
              <div className="flex flex-wrap gap-4"><label className="flex items-center gap-2 text-sm"><input type="radio" name="tree-access-mode" checked={treeAccessMode === "selected"} onChange={() => setTreeAccessMode("selected")} />{t("auth.selectedTrees")}</label><label className="flex items-center gap-2 text-sm"><input type="radio" name="tree-access-mode" checked={treeAccessMode === "all"} onChange={() => setTreeAccessMode("all")} />{t("auth.allTrees")}</label></div>
              {treeAccessMode === "all" ? <p className="text-sm text-muted-foreground">{t("auth.allTreesHelp")}</p> : <div className="space-y-3"><p className="text-sm font-medium">{t("auth.availableTrees")}</p><Input aria-label={t("auth.searchTrees")} placeholder={t("auth.searchTrees")} value={treeSearch} onChange={event => setTreeSearch(event.target.value)} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={visibleTrees.length > 0 && visibleTrees.every(tree => treeIds.includes(tree.id))} onChange={selectAllVisible} />{t("auth.selectAllVisible")}</label><div className="max-h-64 space-y-2 overflow-y-auto">{visibleTrees.map(tree => <label key={tree.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={treeIds.includes(tree.id)} onChange={() => toggle(treeIds, tree.id, setTreeIds)} />{tree.name}</label>)}{!visibleTrees.length && <p className="text-sm text-muted-foreground">{t("auth.noTreesAvailable")}</p>}</div><p className="text-sm text-muted-foreground">{t("auth.selectedCount", { count: treeIds.length })}</p></div>}
            </>}</>}
          </fieldset>
          <div className="flex gap-2"><Button disabled={busy}>{t("common.save")}</Button>{selected && !selected.is_primary_admin && <Button type="button" variant="outline" disabled={busy} onClick={() => void remove()}>{t("common.delete")}</Button>}</div>
        </form>
      </div></section>
    </div>
  </div>
}
