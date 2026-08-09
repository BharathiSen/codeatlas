import { cn } from "@/lib/utils"
import { type ShowcasePanel, TONE_BG, TONE_TEXT } from "@/lib/showcase-panels"

/** Two-column frame shared by the panels that have a sidebar. */
function PanelFrame({
  sidebar,
  children,
}: {
  sidebar?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-[380px] flex-col sm:min-h-[460px] sm:flex-row">
      {sidebar && (
        <div className="flex flex-col gap-1.5 border-b border-border p-5 sm:w-[220px] sm:flex-none sm:border-b-0 sm:border-r">
          {sidebar}
        </div>
      )}
      <div className="min-w-0 flex-1 p-6 sm:p-7">{children}</div>
    </div>
  )
}

/**
 * Renders any `ShowcasePanel` shape. One switch, no per-tab components.
 */
export function ShowcasePanelView({ panel }: { panel: ShowcasePanel }) {
  switch (panel.kind) {
    case "stats":
      return (
        <PanelFrame
          sidebar={panel.sidebar.map((row) => (
            <div
              key={row.label}
              className="flex justify-between py-1.5 font-mono text-[13px] text-muted-foreground"
            >
              <span>{row.label}</span>
              <span className="text-faint">{row.meta}</span>
            </div>
          ))}
        >
          <h3 className="m-0 mb-1.5 font-head text-xl font-bold text-foreground">
            {panel.heading}
          </h3>
          <p className="m-0 mb-5 text-[13px] leading-relaxed text-muted-foreground">
            {panel.body}
          </p>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-border bg-border lg:grid-cols-4">
            {panel.stats.map((stat) => (
              <div key={stat.label} className="bg-card p-4">
                <div className="mb-1 text-[11px] text-faint">{stat.label}</div>
                <div className="font-mono text-[17px] text-foreground">{stat.value}</div>
              </div>
            ))}
          </div>
        </PanelFrame>
      )

    case "prose":
      return (
        <PanelFrame>
          <h3 className="m-0 mb-3.5 font-head text-lg font-bold text-foreground">
            {panel.heading}
          </h3>
          <p className="m-0 mb-5 max-w-[640px] text-[13px] leading-[1.7] text-muted-foreground">
            {panel.body}
          </p>
          <div className="flex flex-wrap gap-2.5">
            {panel.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        </PanelFrame>
      )

    case "chat":
      return (
        <PanelFrame>
          <div className="flex max-w-[640px] flex-col gap-4">
            <div className="self-end rounded-[10px] bg-surface-raised px-3.5 py-2.5 text-[13px] text-foreground sm:max-w-[380px]">
              {panel.question}
            </div>
            <p className="m-0 rounded-[10px] border border-border p-4 text-[13px] leading-[1.7] text-muted-foreground">
              {panel.answer.map((run, i) =>
                run.code ? (
                  <code
                    key={i}
                    className="rounded bg-primary/12 px-1.5 py-0.5 font-mono text-primary"
                  >
                    {run.text}
                  </code>
                ) : (
                  <span key={i}>{run.text}</span>
                )
              )}
            </p>
          </div>
        </PanelFrame>
      )

    case "rows":
      return (
        <PanelFrame>
          {panel.query && (
            <div className="mb-4.5 flex items-center gap-2 rounded-lg border border-border px-3.5 py-2.5 font-mono text-[13px] text-muted-foreground">
              {panel.query}
            </div>
          )}
          <div>
            {panel.rows.map((row) => (
              <div
                key={`${row.badge ?? ""}${row.left}`}
                className="flex items-center gap-3 border-b border-border py-2.5 font-mono text-xs last:border-b-0"
              >
                {row.badge && (
                  <span className={cn("w-11 flex-none", TONE_TEXT[row.badgeTone ?? "primary"])}>
                    {row.badge}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-foreground">{row.left}</span>
                {row.right && <span className="flex-none text-faint">{row.right}</span>}
              </div>
            ))}
          </div>
        </PanelFrame>
      )

    case "split":
      return (
        <PanelFrame
          sidebar={panel.sidebar.map((item, i) => (
            <div
              key={item}
              className={cn(
                "py-1.5 font-mono text-[13px]",
                i === panel.activeIndex ? "text-primary" : "text-muted-foreground"
              )}
            >
              {item}
            </div>
          ))}
        >
          <h4 className="m-0 mb-2.5 font-head text-base font-semibold text-foreground">
            {panel.heading}
          </h4>
          <p className="m-0 text-[13px] leading-relaxed text-muted-foreground">{panel.body}</p>
        </PanelFrame>
      )

    case "flow":
      return (
        <PanelFrame>
          <div className="flex flex-col items-center pt-5">
            {panel.nodes.map((node, i) => (
              <div key={node} className="flex flex-col items-center">
                <div className="rounded-lg border border-border px-6 py-2.5 font-mono text-xs text-foreground">
                  {node}
                </div>
                {i < panel.nodes.length - 1 && (
                  <div aria-hidden="true" className="h-6 w-px bg-border" />
                )}
              </div>
            ))}
          </div>
        </PanelFrame>
      )

    case "bars":
      return (
        <PanelFrame>
          <div className="flex max-w-[420px] flex-col gap-4">
            {panel.items.map((item) => (
              <div key={item.label}>
                <div className="mb-1.5 flex items-center justify-between text-[13px] text-muted-foreground">
                  <span>{item.label}</span>
                  <span className="font-mono">{item.value}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised">
                  <div
                    className={cn("h-full rounded-full", TONE_BG[item.tone])}
                    style={{ width: `${item.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </PanelFrame>
      )
  }
}
