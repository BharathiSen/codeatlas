"use client"

import { useState } from "react"
import { Files, Gauge, Target, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { PLATFORM_POINTS } from "@/lib/site-content"
import { WorkspaceMock } from "@/components/site/workspace-mock"

const ICONS: Record<string, typeof Target> = {
  target: Target,
  files: Files,
  zap: Zap,
  gauge: Gauge,
}

/**
 * "Inside the platform" — a selectable list of product claims beside a static
 * mock of the workspace. Selection reveals the claim's detail; the mock is
 * illustrative and does not change per selection.
 */
export function ProductShowcase() {
  const [activeId, setActiveId] = useState(PLATFORM_POINTS[0].id)

  return (
    <section
      id="platform"
      className="mx-auto max-w-[1280px] scroll-mt-20 border-t border-border px-6 py-16 lg:px-8 lg:py-20"
    >
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[320px_1fr] lg:gap-12">
        <div>
          <h2 className="m-0 mb-2 font-head text-[28px] font-bold tracking-[-0.02em] text-foreground">
            Inside the platform
          </h2>
          <div aria-hidden="true" className="mb-7 h-0.5 w-9 rounded-full bg-primary" />

          <ul className="flex list-none flex-col gap-1 p-0">
            {PLATFORM_POINTS.map((point) => {
              const Icon = ICONS[point.icon] ?? Target
              const active = point.id === activeId
              return (
                <li key={point.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(point.id)}
                    aria-expanded={active}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                      active ? "bg-primary/[0.08] text-primary" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon
                      className={cn("mt-0.5 h-4 w-4 flex-none", active ? "text-primary" : "text-faint")}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{point.title}</span>
                      {active && (
                        <span className="mt-1.5 block text-[13px] leading-relaxed text-muted-foreground">
                          {point.body}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        <WorkspaceMock />
      </div>
    </section>
  )
}
