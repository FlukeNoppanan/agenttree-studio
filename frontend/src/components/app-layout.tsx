import { Outlet } from "react-router-dom"

import { Sidebar } from "@/components/sidebar"

export function AppLayout() {
  return (
    <div className="min-h-screen bg-transparent">
      <Sidebar />
      <main className="lg:pl-[248px]">
        <div className="mx-auto w-full max-w-[1440px] min-w-0 px-4 py-6 sm:px-6 xl:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
