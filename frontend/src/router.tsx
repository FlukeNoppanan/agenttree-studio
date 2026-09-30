import { lazy, Suspense } from "react"
import { createBrowserRouter } from "react-router-dom"
import { ProtectedRoute } from "@/auth"
import { MyTreesRedirect } from "@/pages/legacy-my-trees-redirect"
import { AppLayout } from "@/components/app-layout"
import { RouteError } from "@/components/route-error"

const UsersPage = lazy(() => import("@/pages/users").then(module => ({ default: module.UsersPage })))
const LoginPage = lazy(() => import("@/pages/auth-pages").then(module => ({ default: module.LoginPage })))
const ChangePasswordPage = lazy(() => import("@/pages/auth-pages").then(module => ({ default: module.ChangePasswordPage })))
const AccountPage = lazy(() => import("@/pages/account-page").then(module => ({ default: module.AccountPage })))
const DashboardPage = lazy(() => import("@/pages/dashboard").then(module => ({ default: module.DashboardPage })))
const ProvidersPage = lazy(() => import("@/pages/providers").then(module => ({ default: module.ProvidersPage })))
const SecretsPage = lazy(() => import("@/pages/secrets").then(module => ({ default: module.SecretsPage })))
const TreeDetailPage = lazy(() => import("@/pages/trees/tree-detail").then(module => ({ default: module.TreeDetailPage })))
const TemplateSetupPage = lazy(() => import("@/pages/trees/template-setup").then(module => ({ default: module.TemplateSetupPage })))
const TreeLivePage = lazy(() => import("@/pages/trees/tree-live").then(module => ({ default: module.TreeLivePage })))
const TreeListPage = lazy(() => import("@/pages/trees/tree-list").then(module => ({ default: module.TreeListPage })))
const TreeWizard = lazy(() => import("@/components/tree/tree-wizard").then(module => ({ default: module.TreeWizard })))
const RunDetailPage = lazy(() => import("@/pages/runs/run-detail").then(module => ({ default: module.RunDetailPage })))
const RunListPage = lazy(() => import("@/pages/runs/run-list").then(module => ({ default: module.RunListPage })))
const TraceListPage = lazy(() => import("@/pages/runs/trace-list").then(module => ({ default: module.TraceListPage })))
const ToolsPage = lazy(() => import("@/pages/tools").then(module => ({ default: module.ToolsPage })))
const SettingsPage = lazy(() => import("@/pages/settings").then(module => ({ default: module.SettingsPage })))
const TemplatesPage = lazy(() => import("@/pages/templates").then(module => ({ default: module.TemplatesPage })))
const LearningPage = lazy(() => import("@/pages/learning").then(module => ({ default: module.LearningPage })))
const SecurityEventsPage = lazy(() => import("@/pages/security-events").then(module => ({ default: module.SecurityEventsPage })))

export const router = createBrowserRouter([
  { path: "login", element: <Suspense fallback={<div role="status" className="p-6">Loading…</div>}><LoginPage /></Suspense>, errorElement: <RouteError /> },
  { path: "change-password", element: <Suspense fallback={<div role="status" className="p-6">Loading…</div>}><ChangePasswordPage /></Suspense>, errorElement: <RouteError /> },
  {
    element: <ProtectedRoute />,
    errorElement: <RouteError />,
    children: [
    { element: <Suspense fallback={<div role="status" className="p-6 text-muted-foreground">Loading…</div>}><AppLayout /></Suspense>, children: [
      { index: true, element: <DashboardPage /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "account", element: <AccountPage /> },
      { path: "my-trees", element: <MyTreesRedirect /> },
      { path: "users", element: <ProtectedRoute admin />, children: [{ index: true, element: <UsersPage /> }] },
      { element: <ProtectedRoute permission="manage_trees_agents" />, children: [
      {
        path: "trees",
        element: <TreeListPage />,
      },
      { path: "trees/new", element: <TreeWizard /> },
      { path: "trees/:treeId/setup", element: <TemplateSetupPage /> },
      { path: "trees/:treeId/edit", element: <TreeWizard /> },
      { path: "trees/:treeId", element: <TreeDetailPage /> },
      { path: "templates", element: <TemplatesPage /> },
      { path: "learning", element: <LearningPage /> },
      ] },
      { element: <ProtectedRoute permission="view_executions" />, children: [
      { path: "trees/:treeId/live", element: <TreeLivePage /> },
      {
        path: "runs",
        element: <RunListPage />,
      },
      { path: "runs/:runId", element: <RunDetailPage /> },
      { path: "execution-trace", element: <TraceListPage /> },
      ] },
      { element: <ProtectedRoute permission="manage_providers_models" />, children: [
      {
        path: "providers",
        element: <ProvidersPage />,
      },
      ] },
      { element: <ProtectedRoute permission="manage_tools_mcp" />, children: [
      {
        path: "tools",
        element: <ToolsPage />,
      },
      ] },
      { element: <ProtectedRoute permission="manage_secrets" />, children: [
      {
        path: "secrets",
        element: <SecretsPage />,
      },
      ] },
      { element: <ProtectedRoute admin />, children: [
      { path: "security-events", element: <SecurityEventsPage /> },
      {
        path: "settings",
        element: <SettingsPage />,
      },
      ] },
    ] },
    ],
  },
])
