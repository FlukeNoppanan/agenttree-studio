import { useEffect, useRef, useState } from "react"
import { ChevronDown, KeyRound, LogOut, LockKeyhole, UserRound } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { useAuth } from "@/auth"
import { api } from "@/lib/api"

export function AccountMenu({ compact = false, placement = "above", showApiKeys = true }: { compact?: boolean; placement?: "above" | "below"; showApiKeys?: boolean }) {
  const { user, setUser } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    container.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    function onPointer(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus() }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const items = [...(container.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]
        const current = items.indexOf(document.activeElement as HTMLButtonElement)
        event.preventDefault()
        items[(current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus()
      }
    }
    document.addEventListener("pointerdown", onPointer)
    container.current?.addEventListener("keydown", onKey)
    const element = container.current
    return () => { document.removeEventListener("pointerdown", onPointer); element?.removeEventListener("keydown", onKey) }
  }, [open])
  if (!user) return null
  async function signOut() {
    try { await api.logout() }
    finally { setUser(null); setOpen(false); navigate("/login", { replace: true }) }
  }
  function go(path: string) { setOpen(false); navigate(path) }
  const role = user.is_primary_admin ? t("accountUx.primaryAdmin") : user.is_admin ? t("accountUx.administrator") : t("accountUx.user")
  return <div className="relative" ref={container} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <button ref={trigger} type="button" aria-label={t("accountUx.accountMenu")} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}
      className={`flex w-full items-center gap-2 rounded-md border border-border bg-card text-left hover:bg-accent ${compact ? "h-9 px-2" : "px-3 py-2"}`}>
      <span className={`grid shrink-0 place-items-center rounded-md bg-secondary font-semibold text-foreground ${compact ? "size-6 text-xs" : "size-9"}`}>{user.username.slice(0, 1).toUpperCase()}</span>
      <span className={`min-w-0 flex-1 ${compact ? "hidden max-w-24 xl:block" : ""}`}><span className="block truncate text-sm font-medium">{user.username}</span>{!compact && <span className="block truncate text-xs text-muted-foreground">{role}</span>}</span>
      <ChevronDown className="size-4 shrink-0 text-[var(--sidebar-muted)]" />
    </button>
    {open && <div role="menu" aria-label={t("accountUx.accountMenu")} className={`absolute z-50 w-56 rounded-lg border border-border-strong bg-elevated p-1 shadow-[var(--shadow-lifted)] ${placement === "below" ? "right-0 top-full mt-2" : "bottom-full left-0 mb-2"}`}>
      <button role="menuitem" onClick={() => go("/account")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"><UserRound className="size-4" />{t("accountUx.myAccount")}</button>
      {showApiKeys && (user.is_admin || user.permissions.includes("use_trees")) && <button role="menuitem" onClick={() => go("/account?section=api-keys")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"><KeyRound className="size-4" />{t("apiKeys.title")}</button>}
      <button role="menuitem" onClick={() => go("/change-password")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"><LockKeyhole className="size-4" />{t("auth.changePassword")}</button>
      <div className="my-1 border-t border-border" />
      <button role="menuitem" onClick={() => void signOut()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"><LogOut className="size-4" />{t("auth.signOut")}</button>
    </div>}
  </div>
}
