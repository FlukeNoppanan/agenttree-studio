import { useTranslation } from "react-i18next"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

export interface McpConfigState { transport: "stdio" | "streamable_http"; url: string; command: string; args: string; headers: string; env: string; cwd: string; timeout: string }

export function McpToolConfig({ value, onChange }: { value: McpConfigState; onChange: (value: McpConfigState) => void }) {
  const { t } = useTranslation()

  const set = (key: keyof McpConfigState, item: string) => onChange({ ...value, [key]: item })
  return <div className="space-y-4"><div className="space-y-2"><Label>{t("uiCopy.transport")}</Label><Select value={value.transport} onChange={(event) => set("transport", event.target.value)}><option value="stdio">stdio</option><option value="streamable_http">Streamable HTTP</option></Select></div>{value.transport === "stdio" ? <><div className="space-y-2"><Label>{t("uiCopy.command")}</Label><Input value={value.command} onChange={(event) => set("command", event.target.value)} placeholder="python or npx" /></div><div className="space-y-2"><Label>{t("uiCopy.argumentsJsonArray")}</Label><Textarea className="font-mono text-xs" value={value.args} onChange={(event) => set("args", event.target.value)} /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>{t("uiCopy.environmentJson")}</Label><Textarea className="font-mono text-xs" value={value.env} onChange={(event) => set("env", event.target.value)} /><p className="text-xs text-muted-foreground">{t("uiCopy.use") + " "}{"{{secret}}"}{" " + t("uiCopy.forCredentialValues")}</p></div><div className="space-y-2"><Label>{t("uiCopy.workingDirectory")}</Label><Input value={value.cwd} onChange={(event) => set("cwd", event.target.value)} placeholder="Optional absolute path" /></div></div></> : <><div className="space-y-2"><Label>{t("uiCopy.mcpEndpoint")}</Label><Input value={value.url} onChange={(event) => set("url", event.target.value)} placeholder="https://mcp.example.com/mcp" /></div><div className="space-y-2"><Label>{t("uiCopy.headersJson")}</Label><Textarea className="font-mono text-xs" value={value.headers} onChange={(event) => set("headers", event.target.value)} /><p className="text-xs text-muted-foreground">{t("uiCopy.use") + " "}{"{{secret}}"}{" " + t("uiCopy.forCredentialValues")}</p></div></>}<div className="space-y-2"><Label>{t("uiCopy.timeoutSeconds")}</Label><Input type="number" value={value.timeout} onChange={(event) => set("timeout", event.target.value)} /></div></div>
}
