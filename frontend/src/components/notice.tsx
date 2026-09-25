import { AlertCircle, CircleCheck, X } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface NoticeProps {
  tone: "success" | "error"
  message: string
  onDismiss: () => void
}

export function Notice({ tone, message, onDismiss }: NoticeProps) {
  const { t } = useTranslation()
  const Icon = tone === "success" ? CircleCheck : AlertCircle
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn(
      "flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-sm shadow-sm",
      tone === "success"
        ? "border-success/20 bg-success/8 text-success"
        : "border-destructive/20 bg-destructive/8 text-destructive",
    )}>
      <div className="flex items-center gap-2.5">
        <Icon className="size-4 shrink-0" />
        <span>{message}</span>
      </div>
      <Button variant="ghost" size="icon" className="size-7" onClick={onDismiss}>
        <X className="size-3.5" />
        <span className="sr-only">{t("toolUx.close")}</span>
      </Button>
    </div>
  )
}
