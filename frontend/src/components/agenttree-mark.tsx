import { cn } from "@/lib/utils"

export function AgentTreeMark({ className }: { className?: string }) {
  return <svg viewBox="0 0 40 40" aria-hidden="true" className={cn("size-6", className)} fill="none">
    <path d="M20 8v8m0 0-9 7m9-7 9 7M11 23v7m18-7v7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="20" cy="7" r="3.5" fill="currentColor" />
    <circle cx="20" cy="17" r="3.2" fill="currentColor" />
    <circle cx="11" cy="24" r="3.2" fill="currentColor" />
    <circle cx="29" cy="24" r="3.2" fill="currentColor" />
    <circle cx="11" cy="32" r="2.7" fill="currentColor" />
    <circle cx="29" cy="32" r="2.7" fill="currentColor" />
  </svg>
}

export function BranchMotif({ className }: { className?: string }) {
  return <svg viewBox="0 0 220 120" aria-hidden="true" className={cn("pointer-events-none", className)} fill="none">
    <path d="M18 105c35-8 44-37 72-52 28-15 61-5 91-34M72 66c-2-22 9-37 27-49m15 28c15 2 30-3 42-15m-79 29c-20 1-35-7-47-20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="18" cy="105" r="4" fill="currentColor" /><circle cx="90" cy="53" r="4" fill="currentColor" /><circle cx="181" cy="19" r="4" fill="currentColor" />
    <path d="M97 18c8-8 18-8 24-5-3 10-11 16-24 5Zm59 12c7-8 16-8 22-5-3 9-10 14-22 5ZM31 39c-6-9-15-11-21-9 1 9 8 16 21 9Z" fill="currentColor" opacity=".38" />
  </svg>
}
