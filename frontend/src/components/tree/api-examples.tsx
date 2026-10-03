import { useTranslation } from "react-i18next"
import { useId, useState } from "react"

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
  const path = asyncApi ? "/api/v2/runs" : "/api/v1/trees/" + encodeURIComponent(treeId) + "/invoke"
  const endpoint = origin + path
  const payload = { ...(asyncApi ? { tree_id: treeId } : {}), input: "Summarize the benefits and privacy risks of AI in education in five concise points.", metadata: { client_request_id: "example-001" } }
  const json = JSON.stringify(payload, null, 2)
  const python = [
    "import os", "import time", "import requests", "",
    'base = os.environ.get("AGENTTREE_BASE_URL", ' + JSON.stringify(origin) + ').rstrip("/")',
    'headers = {"Authorization": "Bearer " + os.environ["AGENTTREE_API_KEY"]}',
    "payload = " + JSON.stringify(payload),
    "response = requests.post(base + " + JSON.stringify(path) + ", headers=headers, json=payload, timeout=300)",
    "response.raise_for_status()",
    ...(asyncApi ? [
      'run_id = response.json()["run_id"]', 'print("Run ID:", run_id)', "for _ in range(150):",
      '    response = requests.get(base + "/api/v2/runs/" + run_id, headers=headers, timeout=30)',
      "    response.raise_for_status()",
      '    if response.json()["status"] in ("completed", "failed", "cancelled"):',
      "        break", "    time.sleep(2)", "else:",
      '    raise TimeoutError("Polling timed out; the Run may still be active")',
      'response = requests.get(base + "/api/v2/runs/" + run_id + "/result", headers=headers, timeout=30)',
      "response.raise_for_status()",
    ] : []), "print(response.json())",
  ].join("\n")
  const javascript = [
    "const base = (process.env.AGENTTREE_BASE_URL || " + JSON.stringify(origin) + ').replace(/\\/$/, "");',
    'if (!process.env.AGENTTREE_API_KEY) throw new Error("Set AGENTTREE_API_KEY");',
    'const headers = { Authorization: "Bearer " + process.env.AGENTTREE_API_KEY, "Content-Type": "application/json" };',
    "const payload = " + json + ";", "async function request(path, options = {}) {",
    "  const response = await fetch(base + path, { headers, signal: AbortSignal.timeout(300000), ...options });",
    '  if (!response.ok) throw new Error("Request failed: " + response.status);',
    "  return response.json();", "}",
    "const submitted = await request(" + JSON.stringify(path) + ', { method: "POST", body: JSON.stringify(payload) });',
    ...(asyncApi ? [
      "const runId = submitted.run_id;", 'console.log("Run ID:", runId);', "let state;",
      "for (let attempt = 0; attempt < 150; attempt++) {",
      '  state = await request("/api/v2/runs/" + runId);',
      '  if (["completed", "failed", "cancelled"].includes(state.status)) break;',
      "  await new Promise(resolve => setTimeout(resolve, 2000));", "}",
      'if (!["completed", "failed", "cancelled"].includes(state?.status)) throw new Error("Polling timed out; the Run may still be active");',
      'console.log(await request("/api/v2/runs/" + runId + "/result"));',
    ] : ["console.log(submitted);"]),
  ].join("\n")
  const curl = [
    'set -eu',
    'export AGENTTREE_BASE_URL="' + origin + '"',
    "# Set AGENTTREE_API_KEY securely before running. Requires curl and Python 3.",
    (asyncApi ? "submission=$(" : "") + 'curl --fail-with-body -sS -X POST "$AGENTTREE_BASE_URL' + path + '" \\',
    '  -H "Authorization: Bearer $AGENTTREE_API_KEY" \\',
    "  -H 'Content-Type: application/json' \\",
    "  --data '" + json + "'" + (asyncApi ? ")" : ""),
    ...(asyncApi ? [
      'run_id=$(printf \'%s\' "$submission" | python3 -c \'import json,sys; print(json.load(sys.stdin)["run_id"])\')',
      'printf "Run ID: %s\\n" "$run_id"', 'status=""', "for attempt in $(seq 1 150); do",
      '  state=$(curl --fail-with-body -sS -H "Authorization: Bearer $AGENTTREE_API_KEY" "$AGENTTREE_BASE_URL/api/v2/runs/$run_id") || exit 1',
      '  status=$(printf \'%s\' "$state" | python3 -c \'import json,sys; print(json.load(sys.stdin)["status"])\')',
      '  case "$status" in completed|failed|cancelled) break ;; esac', "  sleep 2", "done",
      'case "$status" in completed|failed|cancelled) ;; *) echo "Polling timed out; the Run may still be active" >&2; exit 1 ;; esac',
      'curl --fail-with-body -sS -H "Authorization: Bearer $AGENTTREE_API_KEY" "$AGENTTREE_BASE_URL/api/v2/runs/$run_id/result"',
    ] : []),
  ].join("\n")
  return { endpoint, examples: { cURL: curl, Python: python, JavaScript: javascript } }
}

export function ApiExamples({ origin, treeId, asyncApi }: { origin: string; treeId: string; asyncApi: boolean }) {
  const { t } = useTranslation()
  const tabId = useId()
  const languages = ["cURL", "Python", "JavaScript"] as const
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
      <p className="text-sm">{t("revision.integration.authHelp")}</p><p className="text-sm text-muted-foreground">{t("baseline.requestHelp")}</p><p className="text-xs text-muted-foreground">{t("baseline.keySecurity")}</p>
      <div role="tablist" aria-label={asyncApi ? "Async API examples" : "Synchronous API examples"} className="flex gap-2">{languages.map(item => <Button key={item} role="tab" id={`${tabId}-${item}`} aria-controls={`${tabId}-panel`} tabIndex={language === item ? 0 : -1} onKeyDown={event => { const index = languages.indexOf(item); const next = event.key === "ArrowRight" ? (index + 1) % languages.length : event.key === "ArrowLeft" ? (index + languages.length - 1) % languages.length : event.key === "Home" ? 0 : event.key === "End" ? languages.length - 1 : -1; if (next >= 0) { event.preventDefault(); setLanguage(languages[next]); (event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next])?.focus() } }} aria-selected={language === item} variant={language === item ? "default" : "outline"} onClick={() => setLanguage(item)}>{item}</Button>)}</div>
      <div className="rounded-md border border-border p-3"><h3 className="text-sm font-medium">{t("baseline.apiWorkbench.prerequisites")}</h3><p className="mt-1 text-xs leading-6 text-muted-foreground">{t(`baseline.apiWorkbench.${language === "cURL" ? "curlHelp" : language === "Python" ? "pythonHelp" : "nodeHelp"}`)}</p></div>
      <div role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${language}`} aria-label={`${language} example`}><pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs">{examples[language]}</pre></div>
      <Button variant="outline" onClick={() => void copy(examples[language])}>{t("revision.integration.copyExample")}</Button>{message && <p role="status" className="text-sm">{message}</p>}
      <p className="text-sm text-muted-foreground">{t("baseline.responseHelp")}</p>
      <ApiResponseGuide asyncApi={asyncApi} />
      {asyncApi && <p className="text-sm text-muted-foreground">{t("revision.integration.asyncAfter")}</p>}
    </CardContent></Card>
}

export function apiResponseExamples(asyncApi: boolean) {
  const runId = "RUN_ID"
  const links = Object.fromEntries(["self", "events", "stream", "result", "artifacts", "cancel"].map(key => [key, "/api/v2/runs/" + runId + (key === "self" ? "" : "/" + key)]))
  return asyncApi ? [
    { key: "accepted", value: { run_id: runId, tree_id: "TREE_ID", tree_version_id: "VERSION_ID", status: "queued", created_at: "2026-10-04T00:00:00Z", links } },
    { key: "result", value: { run_id: runId, status: "completed", final_output: "The actual Tree output appears here.", final_status: "completed", usage: {}, metrics: {}, artifacts: [] } },
  ] : [{ key: "sync", value: { run_id: runId, tree_id: "TREE_ID", tree_version: 1, status: "completed", output: { type: "text", content: "The actual Tree output appears here." }, execution: { started_at: "2026-10-04T00:00:00Z", completed_at: "2026-10-04T00:00:02Z", duration_ms: 2000 }, error: null } }]
}
function ApiResponseGuide({ asyncApi }: { asyncApi: boolean }) {
  const { t } = useTranslation()
  return <details className="min-w-0 border-t border-border pt-3 text-sm"><summary className="cursor-pointer font-medium">{t("baseline.apiWorkbench.responses")}</summary>
    {asyncApi && <p className="mt-3 text-muted-foreground">{t("baseline.apiWorkbench.lifecycle")}</p>}
    {apiResponseExamples(asyncApi).map(example => <div key={example.key} className="mt-3"><h3 className="mb-2 text-xs font-medium">{t("baseline.apiWorkbench." + example.key)}</h3><pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(example.value, null, 2)}</pre></div>)}
    <p className="mt-3 text-xs leading-6 text-muted-foreground">{t("baseline.apiWorkbench.errors")}</p>
  </details>
}
