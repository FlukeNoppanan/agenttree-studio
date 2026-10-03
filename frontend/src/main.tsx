import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router-dom"

import { applyInitialTheme } from "@/components/theme-toggle"

import { router } from "@/router"
import { AuthProvider } from "@/auth"
import "@/i18n"
import "@/index.css"

applyInitialTheme()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider><RouterProvider router={router} /></AuthProvider>
  </StrictMode>,
)
