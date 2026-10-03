import { useTranslation } from "react-i18next"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function integrationOrigin(configured: string | null, browserOrigin: string): string {
  const value = configured || browserOrigin
  try {
    const parsed = new URL(value)
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password
      || ["backend", "frontend", "postgres", "0.0.0.0"].includes(parsed.hostname)) return "https://your-studio.example"
    return parsed.origin
  } catch { return "https://your-studio.example" }
}

export function apiExamples(origin: string, treeId: string, asyncApi: boolean) {
  const endpoint = asyncApi ? `${origin}/api/v2/runs` : `${origin}/api/v1/trees/${encodeURIComponent(treeId)}/invoke`
  const payload = { ...(asyncApi ? { tree_id: treeId } : {}), input: "Summarize this request.", metadata: { client_request_id: "example-001" } }
  const json = JSON.stringify(payload, null, 2)
  const pythonPayload = JSON.stringify(payload)
  return { endpoint, examples: {
    cURL: [
      `curl --fail-with-body -X POST '${endpoint}'`,
      '  -H "Authorization: Bearer ${AGENTTREE_API_KEY}"',
      "  -H 'Content-Type: application/json'",
      `  --data '${json}'`,
    ].join(" \\\n"),
    Python: `import os\nimport requests\n\nresponse = requests.post(\n    ${JSON.stringify(endpoint)},\n    headers={"Authorization": "Bearer " + os.environ["AGENTTREE_API_KEY"]},\n    json=${pythonPayload},\n    timeout=${asyncApi ? "30" : "300"},\n)\nresponse.raise_for_status()\nprint(response.json())`,
    JavaScript: `const response = await fetch(${JSON.stringify(endpoint)}, {\n  method: "POST",\n  headers: {\n    Authorization: "Bearer " + process.env.AGENTTREE_API_KEY,\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify(${json}),\n});\nif (!response.ok) throw new Error("Request failed: " + response.status);\nconsole.log(await response.json());`,
  } }
}

export function ApiExamples({ origin, treeId, asyncApi }: { origin: string; treeId: string; asyncApi: boolean }) {
  const { t } = useTranslation()
  const [language, setLanguage] = useState<"cURL" | "Python" | "JavaScript">("cURL")
  const [message, setMessage] = useState("")
  const { endpoint, examples } = apiExamples(origin, treeId, asyncApi)
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setMessage(t("revision.integration.copied")) }
    catch { setMessage(t("revision.integration.copyFailed")) }
  }
  return <Card><CardHeader><CardTitle>{asyncApi ? t("revision.integration.asyncTitle") : t("revision.integration.syncTitle")}</CardTitle><CardDescription>{asyncApi
    ? t("revision.integration.asyncHelp")
    : t("revision.integration.syncHelp")}</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <div className="flex flex-wrap items-center gap-2"><code className="min-w-0 flex-1 break-all text-sm">POST {endpoint}</code><Button variant="outline" onClick={() => void copy(endpoint)}>{t("revision.integration.copyEndpoint")}</Button></div>
      <p className="text-sm">{t("revision.integration.authHelp")}</p>
      <div role="tablist" aria-label={asyncApi ? "Async API examples" : "Synchronous API examples"} className="flex gap-2">{(["cURL", "Python", "JavaScript"] as const).map(item => <Button key={item} role="tab" aria-selected={language === item} variant={language === item ? "default" : "outline"} onClick={() => setLanguage(item)}>{item}</Button>)}</div>
      <div role="tabpanel" aria-label={`${language} example`}><pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs">{examples[language]}</pre></div>
      <Button variant="outline" onClick={() => void copy(examples[language])}>{t("revision.integration.copyExample")}</Button>{message && <p role="status" className="text-sm">{message}</p>}
      {asyncApi && <p className="text-sm text-muted-foreground">{t("revision.integration.asyncAfter")}</p>}
    </CardContent></Card>
}
