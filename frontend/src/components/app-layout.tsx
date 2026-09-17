import { Outlet } from "react-router-dom"

import { Sidebar } from "@/components/sidebar"

export function AppLayout() {
  return (
    <div className="min-h-screen bg-transparent">
      <Sidebar />
      <main className="lg:pl-72">
        <div className="mx-auto w-full max-w-[1440px] px-4 py-7 sm:px-6 md:px-8 lg:px-10 lg:py-9 xl:px-12">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
