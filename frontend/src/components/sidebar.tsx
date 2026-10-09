import {
  Boxes,
  BrainCircuit,
  FileText,
  Gauge,
  KeyRound,
  Network,
  PlaySquare,
  ScrollText,
  Settings,
  Sparkles,
  Wrench,
  Users,
  type LucideIcon,
} from "lucide-react"
import { NavLink } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { AgentTreeLogoIcon } from "@/components/agenttree-mark"
import { cn } from "@/lib/utils"
import { useAuth } from "@/auth"
import type { Permission } from "@/lib/api"

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  permission?: Permission
  admin?: boolean
  badge?: string
}

interface NavGroup {
  label?: string
  items: NavItem[]
}

const navigation: NavGroup[] = [
  { items: [{ label: "nav.dashboard", href: "/", icon: Gauge }] },
  {
    label: "nav.workspace",
    items: [
      { label: "nav.trees", href: "/trees", icon: Network, permission: "manage_trees_agents" },
      { label: "nav.runs", href: "/executions", icon: PlaySquare, permission: "view_executions" },
      { label: "nav.templates", href: "/templates", icon: Boxes, permission: "manage_trees_agents" },
    ],
  },
  {
    label: "nav.resources",
    items: [
      { label: "nav.providers", href: "/providers", icon: Sparkles, permission: "manage_providers_models" },
      { label: "nav.tools", href: "/tools", icon: Wrench, permission: "manage_tools_mcp" },
      { label: "nav.secrets", href: "/secrets", icon: KeyRound, permission: "manage_secrets" },
    ],
  },
  {
    label: "nav.intelligence",
    items: [{ label: "nav.learning", href: "/learning", icon: BrainCircuit, badge: "nav.comingSoon" }],
  },
  {
    label: "nav.monitoring",
    items: [
      { label: "nav.executionTrace", href: "/execution-trace", icon: ScrollText, permission: "view_executions" },
      { label: "audit.title", href: "/security-events", icon: ScrollText, admin: true },
    ],
  },
  { label: "auth.admin", items: [{ label: "auth.users", href: "/users", icon: Users, admin: true }, { label: "nav.settings", href: "/settings", icon: Settings, admin: true }] },
]

function Logo() {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-8 place-items-center rounded-xl brand-emblem">
        <AgentTreeLogoIcon className="size-6" />
      </div>
      <div>
        <p className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--sidebar-foreground)]">AgentTree Studio</p>
        <p className="mt-0.5 max-w-40 truncate text-[11px] text-[var(--sidebar-muted)]">{t("app.tagline")}</p>
      </div>
    </div>
  )
}

function NavigationLink({ item, mobile = false }: { item: NavItem; mobile?: boolean }) {
  const { t } = useTranslation()
  const Icon = item.icon
  return (
    <NavLink
      to={item.href}
      end={item.href === "/"}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-[color,background-color,box-shadow]",
          mobile && "shrink-0 border border-[var(--sidebar-border)] py-2",
          isActive
            ? "bg-[var(--sidebar-active)] text-[var(--sidebar-foreground)] shadow-[inset_3px_0_0_var(--primary)]"
            : "text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-foreground)]",
        )
      }
    >
      <Icon className="size-4 shrink-0 transition-transform " />
      {t(item.label)}
      {item.badge ? <span className="ml-auto rounded-full border border-primary/30 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">{t(item.badge)}</span> : null}
    </NavLink>
  )
}

export function Sidebar() {
  const { t } = useTranslation()
  const { user, can } = useAuth()
  const visible = navigation.map(group => ({ ...group, items: group.items.filter(item => (!item.admin || user?.is_admin) && (!item.permission || can(item.permission))) })).filter(group => group.items.length)
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[var(--sidebar-width)] flex-col overflow-hidden border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="relative flex h-[var(--app-topbar-height)] items-center border-b border-sidebar-border/80 px-5">
          <Logo />
        </div>
        <nav aria-label={t("integrationPolish.navigation")} className="relative flex-1 space-y-4 overflow-y-auto px-3 py-4">
          {visible.map((group, index) => (
            <div key={group.label ?? index}>
              {group.label ? (
                <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--sidebar-muted)]">
                  {t(group.label)}
                </p>
              ) : null}
              <div className="space-y-1">
                {group.items.map((item) => <NavigationLink key={item.href} item={item} />)}
              </div>
            </div>
          ))}
        </nav>
        <div className="relative space-y-3 border-t border-sidebar-border/80 bg-sidebar px-5 py-4">
          <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-xs text-[var(--sidebar-muted)]"><FileText className="size-3.5" />{t("app.version")}</div></div>
        </div>
      </aside>

      <div className="border-b border-sidebar-border bg-sidebar lg:hidden">
        <nav aria-label={t("integrationPolish.navigation")} className="flex gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none]">
          {visible.flatMap((group) => group.items).map((item) => (
            <NavigationLink key={item.href} item={item} mobile />
          ))}
        </nav>
      </div>
    </>
  )
}
