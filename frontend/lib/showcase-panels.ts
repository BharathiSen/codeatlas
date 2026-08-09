/**
 * Data for the landing page's product showcase.
 *
 * Each tab is a `ShowcasePanel` — a tagged union describing the *shape* of the
 * panel rather than its markup. `ShowcasePanelView` renders every shape, so
 * adding a tab means adding data here, never new JSX.
 *
 * These panels are illustrative product imagery, not live data.
 */

export type PanelTone = "primary" | "accent-2" | "accent-3" | "faint"

export type ShowcasePanel =
  | {
      kind: "stats"
      sidebar: { label: string; meta: string }[]
      heading: string
      body: string
      stats: { label: string; value: string }[]
    }
  | { kind: "prose"; heading: string; body: string; tags: string[] }
  | {
      kind: "chat"
      question: string
      /** Answer is a sequence of prose runs and inline file citations. */
      answer: { text: string; code?: boolean }[]
    }
  | {
      kind: "rows"
      query?: string
      rows: { badge?: string; badgeTone?: PanelTone; left: string; right?: string }[]
    }
  | { kind: "split"; sidebar: string[]; activeIndex: number; heading: string; body: string }
  | { kind: "flow"; nodes: string[] }
  | { kind: "bars"; items: { label: string; value: string; pct: number; tone: PanelTone }[] }

export const SHOWCASE_PANELS: Record<string, ShowcasePanel> = {
  overview: {
    kind: "stats",
    sidebar: [
      { label: "src/", meta: "412 files" },
      { label: "api/", meta: "88 files" },
      { label: "lib/core/", meta: "156 files" },
      { label: "tests/", meta: "210 files" },
      { label: "docs/", meta: "34 files" },
    ],
    heading: "vercel/next.js",
    body: "The React framework for the web. A large, actively maintained monorepo spanning the core framework, compiler, and CLI — ingested whole so every answer sees all of it.",
    stats: [
      { label: "Files", value: "3,204" },
      { label: "Languages", value: "6" },
      { label: "Contributors", value: "1,842" },
      { label: "Last commit", value: "2h ago" },
    ],
  },

  architecture: {
    kind: "prose",
    heading: "Architecture summary",
    body: "The application follows a layered structure: an edge-facing router dispatches requests into a middleware chain, which resolves against a compiled route manifest. Rendering delegates to isolated worker contexts, with shared state persisted through the cache layer.",
    tags: ["router", "middleware", "compiler", "render workers", "cache layer"],
  },

  chat: {
    kind: "chat",
    question: "How does auth get validated on API routes?",
    answer: [
      { text: "Requests pass through " },
      { text: "middleware/auth.ts", code: true },
      { text: ", which verifies the session token against " },
      { text: "lib/session.ts", code: true },
      { text: " before the route handler in " },
      { text: "api/[...route].ts", code: true },
      { text: " runs." },
    ],
  },

  api: {
    kind: "rows",
    rows: [
      { badge: "GET", badgeTone: "accent-3", left: "/api/users" },
      { badge: "POST", badgeTone: "primary", left: "/api/users" },
      { badge: "GET", badgeTone: "accent-3", left: "/api/repos/:id" },
      { badge: "POST", badgeTone: "primary", left: "/api/index" },
    ],
  },

  module: {
    kind: "split",
    sidebar: ["app/", "components/", "lib/", "server/"],
    activeIndex: 1,
    heading: "components/",
    body: "86 files, exports 34 shared UI primitives, consumed across 12 downstream modules.",
  },

  search: {
    kind: "rows",
    query: "validateSession(",
    rows: [
      { left: "lib/session.ts", right: "line 12" },
      { left: "middleware/auth.ts", right: "line 44" },
      { left: "api/logout.ts", right: "line 8" },
    ],
  },

  mermaid: {
    kind: "flow",
    nodes: ["Client", "Edge Router", "API Handler", "Database"],
  },

  languages: {
    kind: "bars",
    items: [
      { label: "TypeScript", value: "61%", pct: 61, tone: "primary" },
      { label: "Rust", value: "18%", pct: 18, tone: "accent-2" },
      { label: "JavaScript", value: "12%", pct: 12, tone: "accent-3" },
      { label: "MDX", value: "9%", pct: 9, tone: "faint" },
    ],
  },
}

export const TONE_BG: Record<PanelTone, string> = {
  primary: "bg-primary",
  "accent-2": "bg-accent-2",
  "accent-3": "bg-accent-3",
  faint: "bg-faint",
}

export const TONE_TEXT: Record<PanelTone, string> = {
  primary: "text-primary",
  "accent-2": "text-accent-2",
  "accent-3": "text-accent-3",
  faint: "text-faint",
}
