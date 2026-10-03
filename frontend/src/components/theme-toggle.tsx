import { Moon, Sun } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"

type Theme = "light" | "dark"

export function getInitialTheme(): Theme {
  let saved: string | null = null
  try { saved = localStorage.getItem("agenttree-theme") } catch { /* Use system preference. */ }
  if (saved === "light" || saved === "dark") return saved
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function applyInitialTheme() {
  document.documentElement.classList.toggle("dark", getInitialTheme() === "dark")
}

export function ThemeToggle() {
  const { t } = useTranslation()
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    const sync = (event: Event) => { const value = (event as CustomEvent<Theme>).detail; if (value === "light" || value === "dark") setTheme(value) }
    window.addEventListener("agenttree-theme-changed", sync)
    return () => window.removeEventListener("agenttree-theme-changed", sync)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    try { localStorage.setItem("agenttree-theme", theme) } catch { /* Theme still works. */ }
    window.dispatchEvent(new CustomEvent("agenttree-theme-changed", { detail: theme }))
  }, [theme])

  const nextTheme = theme === "dark" ? "light" : "dark"

  return (
    <Button
      variant="ghost"
      size="icon"
      className="rounded-md border border-border/70 bg-card/45 text-muted-foreground"
      onClick={() => setTheme(nextTheme)}
      aria-label={t(`revision.theme.${nextTheme}`)}
      title={t(`revision.theme.${nextTheme}`)}
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}
