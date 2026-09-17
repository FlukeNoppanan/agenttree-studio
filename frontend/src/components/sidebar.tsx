import {
  Activity,
  Boxes,
  FileText,
  Gauge,
  KeyRound,
  Network,
  PlaySquare,
  ScrollText,
  Settings,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import { NavLink } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { ThemeToggle } from "@/components/theme-toggle"
import { AgentTreeMark, BranchMotif } from "@/components/agenttree-mark"
import { cn } from "@/lib/utils"

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
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
      { label: "nav.trees", href: "/trees", icon: Network },
      { label: "nav.runs", href: "/runs", icon: PlaySquare },
      { label: "nav.templates", href: "/templates", icon: Boxes },
    ],
  },
  {
    label: "nav.resources",
    items: [
      { label: "nav.providers", href: "/providers", icon: Sparkles },
      { label: "nav.tools", href: "/tools", icon: Wrench },
      { label: "nav.secrets", href: "/secrets", icon: KeyRound },
    ],
  },
  {
    label: "nav.monitoring",
    items: [
      { label: "nav.trace", href: "/execution-trace", icon: Activity },
      { label: "nav.logs", href: "/logs", icon: ScrollText },
    ],
  },
  { items: [{ label: "nav.settings", href: "/settings", icon: Settings }] },
]

function Logo() {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/15">
        <AgentTreeMark className="size-7" />
      </div>
      <div>
        <p className="text-[15px] font-semibold tracking-[-0.02em]">AgentTree Studio</p>
        <p className="mt-0.5 max-w-40 truncate text-[11px] text-muted-foreground">{t("app.tagline")}</p>
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
          "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-[color,background-color,box-shadow]",
          mobile && "shrink-0 border border-border bg-card/85 py-2",
          isActive
            ? "bg-accent text-primary shadow-sm"
            : "text-muted-foreground hover:bg-accent/55 hover:text-foreground",
        )
      }
    >
      <Icon className="size-4 transition-transform group-hover:scale-105" />
      {t(item.label)}
    </NavLink>
  )
}

export function Sidebar() {
  const { t } = useTranslation()
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar/95 backdrop-blur-xl lg:flex">
        <BranchMotif className="absolute -right-12 top-12 h-36 w-64 text-primary/10" />
        <div className="relative flex h-24 items-center border-b border-sidebar-border/80 px-5">
          <Logo />
        </div>
        <nav className="relative flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {navigation.map((group, index) => (
            <div key={group.label ?? index}>
              {group.label ? (
                <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground/75">
                  {t(group.label)}
                </p>
              ) : null}
              <div className="space-y-1">
                {group.items.map((item) => <NavigationLink key={item.href} item={item} />)}
              </div>
            </div>
          ))}
        </nav>
        <div className="relative flex items-center justify-between border-t border-sidebar-border/80 bg-card/25 px-5 py-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="size-3.5" />
            {t("app.version")}
          </div>
          <ThemeToggle />
        </div>
      </aside>

      <div className="border-b border-sidebar-border bg-sidebar/95 backdrop-blur-xl lg:hidden">
        <div className="flex h-18 items-center justify-between px-4 py-3">
          <Logo />
          <ThemeToggle />
        </div>
        <nav className="flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
          {navigation.flatMap((group) => group.items).map((item) => (
            <NavigationLink key={item.href} item={item} mobile />
          ))}
        </nav>
      </div>
    </>
  )
}
