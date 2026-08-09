"use client"

import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"

export function EnhancedLoading({ className, loadingText }: { className?: string; loadingText?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center space-y-5 p-8", className)}>
      <div className="relative flex h-12 w-12 items-center justify-center">
        <span className="absolute inset-0 rounded-full border border-primary/25" />
        <span className="absolute inset-0 rounded-full bg-primary/10 animate-survey-ping" />
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground animate-pulse">
        {loadingText?.replace(/GitIngest/i, "analysis") || "Analyzing repository..."}
      </p>
    </div>
  )
}
