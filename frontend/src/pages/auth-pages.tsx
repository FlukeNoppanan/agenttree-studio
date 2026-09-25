import { useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { Navigate, useNavigate } from "react-router-dom"
import { useAuth } from "@/auth"
import { AgentTreeLogoIcon, BranchMotif } from "@/components/agenttree-mark"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { api, ApiError } from "@/lib/api"

export function LoginPage() {
  const { t } = useTranslation()
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to={user.must_change_password ? "/change-password" : "/"} replace />
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("")
    try { const account = await api.login(username, password); setUser(account); navigate(account.must_change_password ? "/change-password" : "/", { replace: true }) }
    catch (caught) { setError(caught instanceof ApiError && caught.status === 429 ? t("authUx.tooManyAttempts") : t("auth.invalidLogin")) }
    finally { setBusy(false) }
  }
  return <div className="grid min-h-screen place-items-center px-4 py-8"><div className="grid w-full max-w-4xl overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-lifted)] md:grid-cols-[0.9fr_1.1fr]">
    <div className="relative hidden min-h-[32rem] overflow-hidden bg-sidebar p-9 text-[var(--sidebar-foreground)] md:flex md:flex-col md:justify-between"><div className="brand-grid absolute inset-0 opacity-15" /><BranchMotif className="absolute -bottom-16 -right-20 h-96 w-96 text-cyan-200/25" /><div className="relative flex items-center gap-3"><span className="grid size-12 place-items-center rounded-2xl border border-white/20 bg-white/10"><AgentTreeLogoIcon className="size-9" /></span><span className="font-semibold">AgentTree Studio</span></div><p className="relative max-w-xs text-2xl font-semibold leading-snug tracking-tight">{t("app.tagline")}</p></div>
    <div className="flex min-h-[32rem] flex-col justify-center px-6 py-10 sm:px-12"><div className="mb-8 md:hidden"><AgentTreeLogoIcon className="size-12 text-primary" /><p className="mt-2 font-semibold">AgentTree Studio</p></div><h1 className="text-3xl font-semibold tracking-tight">{t("auth.signIn")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("auth.signInHelp")}</p><form onSubmit={submit} className="mt-8 space-y-5"><label className="block space-y-2 text-sm font-medium">{t("auth.username")}<Input autoComplete="username" required value={username} onChange={event => setUsername(event.target.value)} /></label><label className="block space-y-2 text-sm font-medium">{t("auth.password")}<Input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button className="mt-2 w-full" disabled={busy}>{t("auth.signIn")}</Button></form></div>
  </div></div>
}

export function ChangePasswordPage() {
  const { t } = useTranslation()
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  if (!user) return <Navigate to="/login" replace />
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("")
    if (next !== confirm) { setError(t("auth.passwordMismatch")); return }
    setBusy(true)
    try { const account = await api.changePassword(current, next); setUser(account); navigate(user?.must_change_password ? "/" : "/account", { replace: true }) }
    catch { setError(t("auth.passwordChangeFailed")) }
    finally { setBusy(false) }
  }
  return <div className="grid min-h-screen place-items-center px-4"><Card className="w-full max-w-md"><CardHeader><CardTitle>{t("auth.changePassword")}</CardTitle>{user.must_change_password && <p className="text-sm text-muted-foreground">{t("auth.mustChange")}</p>}</CardHeader><CardContent><form onSubmit={submit} className="space-y-4"><label className="block text-sm">{t("auth.currentPassword")}<Input type="password" autoComplete="current-password" required value={current} onChange={e => setCurrent(e.target.value)} /></label><label className="block text-sm">{t("auth.newPassword")}<Input type="password" autoComplete="new-password" minLength={12} required value={next} onChange={e => setNext(e.target.value)} /></label><label className="block text-sm">{t("auth.confirmPassword")}<Input type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} /></label>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={busy}>{t("auth.changePassword")}</Button></form></CardContent></Card></div>
}
