import { useTranslation } from "react-i18next"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

export interface HttpConfigState { method: string; url: string; headers: string; query: string; inputSchema: string; outputHandling: string; timeout: string; testArguments: string }

export function HttpToolConfig({ value, onChange }: { value: HttpConfigState; onChange: (value: HttpConfigState) => void }) {
  const { t } = useTranslation()

  const set = (key: keyof HttpConfigState, item: string) => onChange({ ...value, [key]: item })
  return <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-[140px_1fr]"><div className="space-y-2"><Label>{t("uiCopy.method")}</Label><Select value={value.method} onChange={(event) => set("method", event.target.value)}>{["GET", "POST", "PUT", "PATCH", "DELETE"].map((method) => <option key={method}>{method}</option>)}</Select></div><div className="space-y-2"><Label>{t("uiCopy.url")}</Label><Input value={value.url} onChange={(event) => set("url", event.target.value)} placeholder="https://api.example.com/items/{item_id}" /></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>{t("uiCopy.headersJson")}</Label><Textarea className="min-h-28 font-mono text-xs" value={value.headers} onChange={(event) => set("headers", event.target.value)} /><p className="text-xs text-muted-foreground">{t("uiCopy.use") + " "}{"{{secret}}"}{" " + t("uiCopy.forCredentials")}</p></div><div className="space-y-2"><Label>{t("uiCopy.queryTemplatesJson")}</Label><Textarea className="min-h-28 font-mono text-xs" value={value.query} onChange={(event) => set("query", event.target.value)} /></div></div><div className="space-y-2"><Label>{t("uiCopy.inputSchemaJson")}</Label><Textarea className="min-h-36 font-mono text-xs" value={value.inputSchema} onChange={(event) => set("inputSchema", event.target.value)} /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>{t("uiCopy.outputHandling")}</Label><Select value={value.outputHandling} onChange={(event) => set("outputHandling", event.target.value)}><option value="json">JSON</option><option value="text">{t("uiCopy.text")}</option></Select></div><div className="space-y-2"><Label>{t("uiCopy.timeoutSeconds")}</Label><Input type="number" value={value.timeout} onChange={(event) => set("timeout", event.target.value)} /></div></div><div className="space-y-2"><Label>{t("uiCopy.connectionTestArgumentsJson")}</Label><Textarea className="font-mono text-xs" value={value.testArguments} onChange={(event) => set("testArguments", event.target.value)} /></div></div>
}
