import { Outlet, useLocation } from "react-router-dom"

import { WelcomeDialog } from "@/components/welcome-dialog"
import { Sidebar } from "@/components/sidebar"
import { AppTopbar } from "@/components/app-topbar"

export function AppLayout() {
  const { pathname } = useLocation()
  const wide = /^\/(trees|executions|runs|templates|tools|providers|execution-trace)(\/|$)/.test(pathname)
  return (
    <div className="min-h-screen bg-transparent">
      <Sidebar />
      <WelcomeDialog />
      <div className="app-content">
        <AppTopbar />
        <main className={`mx-auto w-full ${wide ? "max-w-none" : "max-w-[1440px]"} min-w-0 px-4 py-4 sm:px-5 xl:px-6`}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
