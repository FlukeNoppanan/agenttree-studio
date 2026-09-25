import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { api, type Permission, type StudioUser } from "@/lib/api"

interface AuthState {
  user: StudioUser | null
  loading: boolean
  setUser: (user: StudioUser | null) => void
  refresh: () => Promise<void>
  can: (permission: Permission) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StudioUser | null>(null)
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    try { setUser(await api.me()) }
    catch { setUser(null) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const expired = () => setUser(null)
    window.addEventListener("studio-auth-expired", expired)
    return () => window.removeEventListener("studio-auth-expired", expired)
  }, [])
  return <AuthContext.Provider value={{ user, loading, setUser, refresh, can: permission => Boolean(user?.is_admin || user?.permissions.includes(permission)) }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error("AuthProvider is required")
  return value
}

export function ProtectedRoute({ permission, admin = false }: { permission?: Permission; admin?: boolean }) {
  const { user, loading, can } = useAuth()
  const location = useLocation()
  const { t } = useTranslation()
  if (loading) return <div className="grid min-h-screen place-items-center text-muted-foreground">{t("common.loading")}</div>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (user.must_change_password && location.pathname !== "/change-password") return <Navigate to="/change-password" replace />
  if ((admin && !user.is_admin) || (permission && !can(permission))) return <div className="mx-auto max-w-xl p-10 text-center text-xl font-semibold">{t("auth.accessDenied")}</div>
  return <Outlet />
}
