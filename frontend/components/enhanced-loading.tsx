"use client"

import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"

export function EnhancedLoading({ className, loadingText }: { className?: string; loadingText?: string }) {
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
        {loadingText?.replace(/GitIngest/i, "analysis") || "Analyzing repository..."}
      </p>
    </div>
  )
}
