import {
  Boxes,
  ScrollText,
} from "lucide-react"
import { createBrowserRouter } from "react-router-dom"

import { AppLayout } from "@/components/app-layout"
import { DashboardPage } from "@/pages/dashboard"
import { PlaceholderPage } from "@/pages/placeholder"
import { ProvidersPage } from "@/pages/providers"
import { SecretsPage } from "@/pages/secrets"
import { TreeDetailPage } from "@/pages/trees/tree-detail"
import { TreeListPage } from "@/pages/trees/tree-list"
import { TreeWizard } from "@/components/tree/tree-wizard"
import { RunDetailPage } from "@/pages/runs/run-detail"
import { RunListPage } from "@/pages/runs/run-list"
import { TraceListPage } from "@/pages/runs/trace-list"
import { ToolsPage } from "@/pages/tools"
import { SettingsPage } from "@/pages/settings"

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      {
        path: "trees",
        element: <TreeListPage />,
      },
      { path: "trees/new", element: <TreeWizard /> },
      { path: "trees/:treeId/edit", element: <TreeWizard /> },
      { path: "trees/:treeId", element: <TreeDetailPage /> },
      {
        path: "runs",
        element: <RunListPage />,
      },
      { path: "runs/:runId", element: <RunDetailPage /> },
      {
        path: "templates",
        element: <PlaceholderPage title="Templates" description="Start from reusable AgentTree configurations." icon={Boxes} />,
      },
      {
        path: "providers",
        element: <ProvidersPage />,
      },
      {
        path: "tools",
        element: <ToolsPage />,
      },
      {
        path: "secrets",
        element: <SecretsPage />,
      },
      {
        path: "execution-trace",
        element: <TraceListPage />,
      },
      {
        path: "logs",
        element: <PlaceholderPage title="Logs" description="Explore local Studio operational logs." icon={ScrollText} />,
      },
      {
        path: "settings",
        element: <SettingsPage />,
      },
    ],
  },
])
