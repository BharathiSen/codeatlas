import { MORE_PAGES } from "@/lib/site-content"

/** Tiny abstract previews — suggestive of each surface, not screenshots. */
function Preview({ kind }: { kind: (typeof MORE_PAGES)[number]["preview"] }) {
  const base = "h-24 w-full rounded-lg border border-border bg-background p-3 overflow-hidden"

  if (kind === "chat") {
    return (
      <div className={base} aria-hidden="true">
        <div className="mb-2 h-1.5 w-4/5 rounded-full bg-surface-raised" />
        <div className="mb-2 h-1.5 w-full rounded-full bg-surface-raised" />
        <div className="mb-3 h-1.5 w-2/3 rounded-full bg-surface-raised" />
        <div className="ml-auto h-1.5 w-1/2 rounded-full bg-primary/40" />
      </div>
    )
  }

  if (kind === "graph" || kind === "diagram") {
    const nodes = [
      { x: "50%", y: "50%", primary: true },
      { x: "18%", y: "26%" },
      { x: "78%", y: "22%" },
      { x: "26%", y: "76%" },
      { x: "72%", y: "74%" },
      { x: "88%", y: "50%" },
    ]
    return (
      <div className={`${base} relative`} aria-hidden="true">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {nodes.slice(1).map((n, i) => (
            <line
              key={i}
              x1="50"
              y1="50"
              x2={parseFloat(n.x)}
              y2={parseFloat(n.y)}
              stroke="#8b5cf6"
              strokeOpacity="0.28"
              strokeWidth="0.6"
            />
          ))}
        </svg>
        {nodes.map((n, i) => (
          <span
            key={i}
            style={{ left: n.x, top: n.y }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${
              n.primary ? "h-2.5 w-2.5 bg-primary" : "h-1.5 w-1.5 bg-primary/45"
            }`}
          />
        ))}
      </div>
    )
  }

  if (kind === "tree") {
    return (
      <div className={`${base} flex gap-2`} aria-hidden="true">
        <div className="flex w-1/3 flex-col gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={`h-1.5 rounded-full ${i === 1 ? "bg-primary/50" : "bg-surface-raised"}`} style={{ width: `${70 - i * 6}%` }} />
          ))}
        </div>
        <div className="flex flex-1 flex-col gap-1.5 border-l border-border pl-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-1.5 rounded-full bg-surface-raised" style={{ width: `${95 - i * 9}%` }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={base} aria-hidden="true">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[9px] text-faint">Today</span>
      </div>
      <div className="mb-2 font-mono text-[11px] text-foreground">312 / 1,000</div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised">
        <div className="h-full w-[31%] rounded-full bg-gradient-to-r from-[#8b5cf6] to-[#7c3aed]" />
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <span className="h-1 w-1 rounded-full bg-primary" />
        <span className="text-[9px] text-faint">Using fallback key</span>
      </div>
    </div>
  )
}

export function MorePages() {
  return (
    <section className="mx-auto max-w-[1280px] px-6 pb-20 lg:px-8">
      <h2 className="m-0 mb-7 font-head text-[26px] font-bold tracking-[-0.02em] text-foreground">
        More pages
      </h2>

      <ul className="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-5">
        {MORE_PAGES.map((page) => (
          <li
            key={page.title}
            className="ca-glow-hover rounded-xl border border-border bg-card p-4"
          >
            <h3 className="m-0 mb-3 font-head text-[15px] font-bold text-foreground">
              {page.title}
            </h3>
            <Preview kind={page.preview} />
            <p className="m-0 mt-3 text-[13px] leading-relaxed text-muted-foreground">
              {page.desc}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
