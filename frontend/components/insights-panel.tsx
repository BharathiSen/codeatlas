"use client"

import { useCallback, useState } from "react"
import { AlertTriangle, Loader2, RefreshCw, Sparkles } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Markdown } from "@/components/markdown"
import { cn } from "@/lib/utils"
import { INSIGHT_ORDER, INSIGHTS, type InsightKind } from "@/lib/insights"

interface InsightsPanelProps {
  username: string
  repo: string
}

interface InsightState {
  markdown?: string
  error?: string
  loading: boolean
  cached?: boolean
  /** True when the repository did not fit the token budget and was cut. */
  truncated?: boolean
}

/**
 * Repository intelligence surface: runs one whole-repository analysis at a time
 * and renders the resulting document.
 *
 * Results are cached server-side, so revisiting a tab is free. Each analysis is
 * requested explicitly rather than on mount — they consume the daily quota, and
 * silently spending it on six analyses nobody asked for would be hostile.
 */
export default function InsightsPanel({ username, repo }: InsightsPanelProps) {
  const [active, setActive] = useState<InsightKind>(INSIGHT_ORDER[0])
  const [results, setResults] = useState<Record<string, InsightState>>({})

  const current = results[active] ?? { loading: false }

  const run = useCallback(
    async (kind: InsightKind, forceRefresh = false) => {
      setResults((prev) => ({ ...prev, [kind]: { loading: true } }))

      try {
        const response = await fetch("/api/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, repo, kind, force_refresh: forceRefresh }),
        })
        const payload = await response.json()

        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Failed to generate analysis")
        }

        setResults((prev) => ({
          ...prev,
          [kind]: {
            loading: false,
            markdown: payload.data.markdown,
            cached: payload.cached,
            truncated: payload.usage?.truncated ?? false,
          },
        }))

        if (payload.rateLimit) {
          window.dispatchEvent(
            new CustomEvent("aiRateLimitUpdate", { detail: payload.rateLimit })
          )
        }
      } catch (error) {
        setResults((prev) => ({
          ...prev,
          [kind]: {
            loading: false,
            error: error instanceof Error ? error.message : "Failed to generate analysis",
          },
        }))
      }
    },
    [username, repo]
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        role="tablist"
        aria-label="Repository analyses"
        className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2.5"
      >
        {INSIGHT_ORDER.map((kind) => {
          const selected = kind === active
          return (
            <button
              key={kind}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(kind)}
              className={cn(
                "rounded-md px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors",
                selected
                  ? "bg-primary/[0.12] text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {INSIGHTS[kind].label}
            </button>
          )
        })}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-6">
          {current.loading && (
            <div className="flex flex-col items-center gap-4 py-16">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <p
                role="status"
                aria-live="polite"
                className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground"
              >
                Analysing repository…
              </p>
            </div>
          )}

          {!current.loading && current.error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/[0.06] p-4">
              <p className="m-0 text-sm text-foreground">{current.error}</p>
              <button
                type="button"
                onClick={() => run(active)}
                className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Try again
              </button>
            </div>
          )}

          {!current.loading && !current.error && !current.markdown && (
            <div className="mx-auto max-w-md py-16 text-center">
              <Sparkles className="mx-auto h-6 w-6 text-primary" aria-hidden="true" />
              <h3 className="mt-4 font-head text-lg font-bold text-foreground">
                {INSIGHTS[active].label}
              </h3>
              <p className="mx-auto mt-2 text-sm leading-relaxed text-muted-foreground">
                {INSIGHTS[active].blurb}
              </p>
              <button
                type="button"
                onClick={() => run(active)}
                className="ca-btn-gradient mt-6 rounded-lg px-4 py-2.5 text-[13px] font-semibold"
              >
                Run analysis
              </button>
              <p className="mt-3 font-mono text-[11px] text-faint">
                Uses one request from your daily budget
              </p>
            </div>
          )}

          {!current.loading && current.markdown && (
            <>
              {current.truncated && (
                <div
                  role="note"
                  className="mb-4 flex gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/[0.07] p-3.5"
                >
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 flex-none text-yellow-500"
                    aria-hidden="true"
                  />
                  <p className="m-0 text-[13px] leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground">Partial analysis.</span>{" "}
                    This repository exceeded the context budget, so only part of it was read.
                    Sections may omit files entirely — treat anything absent here as unverified
                    rather than missing from the codebase.
                  </p>
                </div>
              )}

              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
                  {current.cached ? "cached result" : "freshly generated"}
                </span>
                <button
                  type="button"
                  onClick={() => run(active, true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary/45 hover:text-foreground"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  Regenerate
                </button>
              </div>

              <Markdown>{current.markdown}</Markdown>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
