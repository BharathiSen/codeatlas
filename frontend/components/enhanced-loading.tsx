"use client"

import { cn } from "@/lib/utils"
import { Check, Loader2 } from "lucide-react"

/**
 * A stage in a visible pipeline.
 *
 * `pending` renders hollow, `active` spins, `done` ticks. `detail` carries a
 * measured fact — a chunk count, a byte size — and is only ever set from a real
 * response. Nothing here interpolates, estimates or animates toward a number the
 * client has not actually been told.
 */
export interface LoadingStage {
  id: string
  label: string
  state: "pending" | "active" | "done"
  detail?: string
}

function StageRow({ stage }: { stage: LoadingStage }) {
  return (
    <li className="flex items-center gap-2.5 font-mono text-xs">
      <span className="grid h-4 w-4 shrink-0 place-items-center" aria-hidden="true">
        {stage.state === "done" ? (
          <Check className="h-3.5 w-3.5 text-primary" />
        ) : stage.state === "active" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full border border-muted-foreground/40" />
        )}
      </span>

      <span
        className={cn(
          "transition-colors",
          stage.state === "done" && "text-muted-foreground",
          stage.state === "active" && "text-foreground",
          stage.state === "pending" && "text-muted-foreground/50"
        )}
      >
        {stage.label}
      </span>

      {stage.detail && (
        <span className="text-muted-foreground/70">— {stage.detail}</span>
      )}
    </li>
  )
}

/**
 * Loading state for repository analysis.
 *
 * Given `stages`, it renders the pipeline as a checklist so a 20–30 second
 * operation reads as deliberate work rather than a frozen page. Without them it
 * falls back to the original single-line spinner, so every other caller is
 * unaffected.
 *
 * The stages are driven entirely by real events — an ingestion response, a poll
 * of the index status — never by a timer. A tick means that step actually
 * finished. That constraint is the whole point: a progress display that lies is
 * worse than no progress display, because the next thing the user disbelieves is
 * the answer.
 */
export function EnhancedLoading({
  className,
  loadingText,
  stages,
}: {
  className?: string
  loadingText?: string
  stages?: LoadingStage[]
}) {
  const headline = loadingText?.replace(/GitIngest/i, "analysis") || "Analyzing repository..."

  if (!stages?.length) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-5 p-8", className)}>
        <div className="relative grid h-12 w-12 place-items-center">
          <span aria-hidden="true" className="absolute inset-0 rounded-full border border-primary/25" />
          <span aria-hidden="true" className="absolute inset-0 rounded-full bg-primary/10 animate-ca-pulse" />
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
        <p
          role="status"
          aria-live="polite"
          className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground"
        >
          {headline}
        </p>
      </div>
    )
  }

  return (
    <div className={cn("flex w-full flex-col items-center gap-5 p-8", className)}>
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
        {headline}
      </p>

      {/*
        One live region for the whole list rather than per row: a screen reader
        should hear "Building semantic index", not five re-announcements as the
        icons change.
      */}
      <ul role="status" aria-live="polite" className="flex w-full max-w-[340px] flex-col gap-2.5">
        {stages.map((stage) => (
          <StageRow key={stage.id} stage={stage} />
        ))}
      </ul>
    </div>
  )
}
