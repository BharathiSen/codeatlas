import {
  ChevronRight,
  GitBranch,
  LayoutGrid,
  MessageSquare,
  Network,
  Search,
  Settings,
  Share2,
} from "lucide-react"
import { LogoMark } from "@/components/site/logo-mark"

const SIDEBAR_ITEMS = [
  { label: "Overview", icon: LayoutGrid, active: true },
  { label: "Chat", icon: MessageSquare, active: false },
  { label: "Architecture", icon: Share2, active: false },
  { label: "Dependencies", icon: Network, active: false },
  { label: "Code Explorer", icon: GitBranch, active: false },
  { label: "Search", icon: Search, active: false },
  { label: "Settings", icon: Settings, active: false },
]

const STATS = [
  { label: "Languages", value: "TypeScript", note: "87%" },
  { label: "Dependencies", value: "1,204", note: "Direct" },
  { label: "Code paths", value: "8,347", note: "Functions & classes" },
  { label: "Diagrams", value: "42", note: "Generated" },
]

const MODULES = ["app/", "pages/ (legacy)", "components/", "lib/", "utils/", "styles/"]

/**
 * Illustrative product imagery of the repository workspace. Static by design —
 * this is a picture of the product, not a live view of it.
 */
export function WorkspaceMock() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex min-h-[420px] flex-col sm:flex-row">
        {/* Sidebar */}
        <div className="flex-none border-b border-border p-4 sm:w-[190px] sm:border-b-0 sm:border-r">
          <div className="mb-4 px-1">
            <LogoMark />
          </div>

          <div className="mb-1 flex items-center gap-2 rounded-md px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
            vercel/next.js
          </div>
          <div className="mb-4 flex items-center gap-2 rounded-md px-2 py-1.5 font-mono text-[11px] text-faint">
            <GitBranch className="h-3 w-3" aria-hidden="true" />
            main
          </div>

          <ul className="flex list-none flex-col gap-0.5 p-0">
            {SIDEBAR_ITEMS.map((item) => (
              <li
                key={item.label}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
                  item.active
                    ? "border border-primary/25 bg-primary/[0.10] text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                <item.icon
                  className={`h-3.5 w-3.5 ${item.active ? "text-primary" : ""}`}
                  aria-hidden="true"
                />
                <span className="flex-1 truncate">{item.label}</span>
                <ChevronRight className="h-3 w-3 text-faint" aria-hidden="true" />
              </li>
            ))}
          </ul>
        </div>

        {/* Main panel */}
        <div className="min-w-0 flex-1 p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-1 text-[13px] text-muted-foreground">Overview</div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-head text-xl font-bold text-foreground">vercel/next.js</span>
                <span className="rounded border border-primary/30 bg-primary/[0.10] px-2 py-0.5 font-mono text-[10px] text-primary">
                  Indexed
                </span>
              </div>
              <div className="mt-1 font-mono text-[11px] text-faint">
                Last indexed 2 hours ago · 45,321 files · 1.2M LOC
              </div>
            </div>

            <div className="w-full max-w-[210px] rounded-lg border border-border p-3">
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[11px] text-muted-foreground">Requests today</span>
              </div>
              <div className="mb-1.5 font-mono text-[13px] text-foreground">312 / 1,000</div>
              <div className="h-1 overflow-hidden rounded-full bg-surface-raised">
                <div className="h-full w-[31%] rounded-full bg-gradient-to-r from-[#8b5cf6] to-[#7c3aed]" />
              </div>
              <div className="mt-1.5 font-mono text-[10px] text-faint">Resets in 14h 42m</div>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-border p-4">
              <div className="mb-2 text-[12px] font-medium text-foreground">
                Architecture summary
              </div>
              <p className="m-0 text-[11px] leading-relaxed text-muted-foreground">
                Next.js is a React framework with a file-system routing layer, server and client
                components, data fetching primitives, and a build pipeline targeting Node.js and
                Edge runtimes.
              </p>
            </div>

            {/* Module graph */}
            <div className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap gap-1.5">
                {MODULES.map((m, i) => (
                  <span
                    key={m}
                    className={`rounded border px-2 py-1 font-mono text-[10px] ${
                      i % 3 === 0
                        ? "border-primary/30 bg-primary/[0.08] text-primary"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
            {STATS.map((stat) => (
              <div key={stat.label} className="bg-card p-3">
                <div className="mb-1 text-[10px] text-faint">{stat.label}</div>
                <div className="font-mono text-[15px] text-foreground">{stat.value}</div>
                <div className="mt-0.5 text-[10px] text-faint">{stat.note}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
