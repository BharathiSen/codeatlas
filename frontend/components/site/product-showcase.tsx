"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { SHOWCASE_TABS } from "@/lib/site-content"
import { SHOWCASE_PANELS } from "@/lib/showcase-panels"
import { SectionHeading } from "@/components/site/section-heading"
import { ShowcasePanelView } from "@/components/site/showcase-panel"

/**
 * Tabbed product tour. Tabs come from `SHOWCASE_TABS`, panels from
 * `SHOWCASE_PANELS`; this component only owns selection and the browser frame.
 */
export function ProductShowcase() {
  const [activeTab, setActiveTab] = useState(SHOWCASE_TABS[0].id)
  const panel = SHOWCASE_PANELS[activeTab]

  return (
    <section id="platform" className="mx-auto max-w-[1280px] scroll-mt-20 px-6 py-20 lg:px-8 lg:py-24">
      <SectionHeading
        align="center"
        eyebrow="Product"
        title="Inside the platform"
        description="One workspace per repository. Every view reads from the same indexed context."
        className="mb-11"
      />

      <div role="tablist" aria-label="Product views" className="mb-6 flex flex-wrap justify-center gap-2">
        {SHOWCASE_TABS.map((tab) => {
          const selected = tab.id === activeTab
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`showcase-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls="showcase-panel"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "whitespace-nowrap rounded-full border px-3.5 py-2 font-mono text-xs transition-colors",
                selected
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="ca-ticks ca-ticks-lg overflow-hidden rounded border border-white/20 bg-card shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-2 border-b border-dashed border-border bg-surface-raised px-4 py-3">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-[#3d3d44]" />
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-[#3d3d44]" />
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-[#3d3d44]" />
          <span className="ml-2 truncate font-mono text-xs text-faint">
            codeatlas.dev/vercel/next.js/{activeTab}
          </span>
        </div>

        <div
          id="showcase-panel"
          role="tabpanel"
          aria-labelledby={`showcase-tab-${activeTab}`}
          tabIndex={0}
        >
          <ShowcasePanelView panel={panel} />
        </div>
      </div>
    </section>
  )
}
