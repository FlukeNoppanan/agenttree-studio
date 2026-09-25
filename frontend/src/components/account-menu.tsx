import { useState } from "react"
import { ChevronDown, KeyRound, LogOut, LockKeyhole, UserRound } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { useAuth } from "@/auth"
import { api } from "@/lib/api"

export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const { user, setUser } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  if (!user) return null
  async function signOut() {
    try { await api.logout() }
    finally { setUser(null); setOpen(false); navigate("/login", { replace: true }) }
  }
  function go(path: string) { setOpen(false); navigate(path) }
  const role = user.is_primary_admin ? t("accountUx.primaryAdmin") : user.is_admin ? t("accountUx.administrator") : t("accountUx.user")
  return <div className="relative">
    <button type="button" aria-label={t("accountUx.accountMenu")} aria-expanded={open} onClick={() => setOpen(value => !value)}
      className="flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-left text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-active)]">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 font-semibold text-primary">{user.username.slice(0, 1).toUpperCase()}</span>
      <span className={`min-w-0 flex-1 ${compact ? "hidden sm:block" : ""}`}><span className="block truncate text-sm font-medium">{user.username}</span><span className="block truncate text-xs text-[var(--sidebar-muted)]">{role}</span></span>
      <ChevronDown className="size-4 shrink-0 text-[var(--sidebar-muted)]" />
    </button>
    {open && <div role="menu" className="absolute bottom-full left-0 z-50 mb-2 w-56 rounded-xl border border-border bg-card p-1 shadow-lg lg:bottom-full max-lg:bottom-auto max-lg:top-full max-lg:mt-2">
      <button role="menuitem" onClick={() => go("/account")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"><UserRound className="size-4" />{t("accountUx.myAccount")}</button>
      {(user.is_admin || user.permissions.includes("use_trees")) && <button role="menuitem" onClick={() => go("/account?section=api-keys")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"><KeyRound className="size-4" />{t("apiKeys.title")}</button>}
      <button role="menuitem" onClick={() => go("/change-password")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"><LockKeyhole className="size-4" />{t("auth.changePassword")}</button>
      <div className="my-1 border-t border-border" />
      <button role="menuitem" onClick={() => void signOut()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"><LogOut className="size-4" />{t("auth.signOut")}</button>
    </div>}
  </div>
}
