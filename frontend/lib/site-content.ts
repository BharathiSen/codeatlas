/**
 * Structured content for the marketing surfaces.
 *
 * Every landing/features section renders from these arrays so the JSX stays a
 * single template per section rather than repeated markup. Copy changes happen
 * here; layout changes happen in `components/site/`.
 */

export interface NavLink {
  href: string
  label: string
}

export interface PipelineStep {
  num: string
  title: string
  blurb: string
}

export interface FeatureGroup {
  tag: string
  title: string
  desc: string
  items: { title: string; desc: string }[]
}

export const NAV_LINKS: NavLink[] = [
  { href: "/#platform", label: "Product" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/features", label: "Features" },
  { href: "/docs", label: "Docs" },
]

/** The five assurances in the strip above the footer. */
export const TRUST_ITEMS: { icon: string; title: string; note: string }[] = [
  { icon: "lock", title: "Private repos", note: "Coming soon" },
  { icon: "server", title: "Self-hostable", note: "Docker & source" },
  { icon: "cpu", title: "Multiple LLMs", note: "Gemini today, pluggable" },
  { icon: "shield", title: "Never train on your code", note: "Your code stays yours" },
  { icon: "code", title: "Open source", note: "MIT License" },
]

/** Cards in the "More pages" row, each previewing a workspace surface. */
export const MORE_PAGES: { title: string; desc: string; preview: "chat" | "graph" | "tree" | "meter" | "diagram" }[] = [
  {
    title: "Chat",
    desc: "Ask anything about the repo. Answers cite files and line ranges you can open.",
    preview: "chat",
  },
  {
    title: "Architecture",
    desc: "High-level module view with generated diagrams and explanations.",
    preview: "diagram",
  },
  {
    title: "Dependencies",
    desc: "Visualize dependencies between packages and internal modules.",
    preview: "graph",
  },
  {
    title: "Code Explorer",
    desc: "Explore the full tree with syntax highlighting and quick preview.",
    preview: "tree",
  },
  {
    title: "Usage & Limits",
    desc: "Daily budget and reset timers — always visible, never a surprise.",
    preview: "meter",
  },
]

/** The selectable list beside the product mock. */
export const PLATFORM_POINTS: { id: string; title: string; icon: string; body: string }[] = [
  {
    id: "grounded",
    title: "Answers grounded in the whole repo",
    icon: "target",
    body: "The full tree and file contents are ingested in one pass, so answers reason about the system rather than the file you happen to have open.",
  },
  {
    id: "more-than-source",
    title: "Reads more than source",
    icon: "files",
    body: "Code, Markdown, notebooks, PDFs and configuration all render in place and all feed the same context.",
  },
  {
    id: "warm",
    title: "Warm by default",
    icon: "zap",
    body: "A repository is ingested once and cached, so returning to it opens immediately instead of re-cloning.",
  },
  {
    id: "bounded",
    title: "Bounded, visible usage",
    icon: "gauge",
    body: "A daily request budget sits in the workspace header with its reset timer, backed by a fallback key.",
  },
]

/*
 * Repositories offered as one-click examples.
 *
 * Every entry must sit under MAX_REPO_SIZE_KB (10,000 KB by default), or the
 * chip hands the visitor a refusal instead of a demo. The previous list —
 * next.js, react, kubernetes, fastapi — measured 2,531,398 / 1,064,330 /
 * 1,510,599 / 53,301 KB respectively, so all four were rejected the moment the
 * ceiling was sized for the deployment tier (D-41).
 *
 * Chosen for a mix of languages, so tree-sitter's breadth is visible rather than
 * asserted, and for names a reviewer is likely to recognise.
 */
export const EXAMPLE_REPOS = [
  "expressjs/cors", // 243 KB — JavaScript
  "chalk/chalk", // 1,093 KB — TypeScript
  "tiangolo/typer", // 4,068 KB — Python
  "pallets/click", // 5,217 KB — Python
]

export const PIPELINE_STEPS: PipelineStep[] = [
  {
    num: "01",
    title: "Ingest",
    blurb:
      "We clone the repo and read code, notebooks, docs and configs to build a complete context of your project.",
  },
  {
    num: "02",
    title: "Index",
    blurb:
      "That context is cached and kept warm, so the map is built once and every question after is answered against the same ground truth.",
  },
  {
    num: "03",
    title: "Interrogate",
    blurb:
      "Ask in plain language. Answers cite real paths and draw real diagrams, because they are derived from the source rather than recalled.",
  },
]

export const FOOTER_LINKS: NavLink[] = [
  { href: "/features", label: "Features" },
  { href: "/docs", label: "Documentation" },
  { href: "/docs#configuration", label: "Configuration" },
  { href: "/docs#quickstart", label: "Quickstart" },
]

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    tag: "01 — Understanding",
    title: "Grounded comprehension",
    desc: "Answers and summaries are built from the whole repository, not a single prompt or open file.",
    items: [
      { title: "Answers grounded in the whole repository", desc: "Every response draws on the full indexed tree and file contents." },
      { title: "Architecture summaries", desc: "A generated overview of how the system is structured, in plain language." },
      { title: "File-scoped explanations", desc: "Select any file and ask about it without losing the surrounding context." },
      { title: "Length-calibrated responses", desc: "Overviews stay short; technical questions get the depth they need." },
    ],
  },
  {
    tag: "02 — Structure",
    title: "Navigating the system",
    desc: "See how the pieces connect before you change any of them.",
    items: [
      { title: "API flow explanations", desc: "Trace a request through handlers, services, and data layers." },
      { title: "Mermaid diagram generation", desc: "Architecture and sequence diagrams generated directly from source." },
      { title: "Interactive file explorer", desc: "Browse the tree with the assistant alongside, sharing one context." },
      { title: "Rich file rendering", desc: "Source, Jupyter notebooks and PDFs all viewable in place." },
    ],
  },
  {
    tag: "03 — Onboarding",
    title: "Getting new contributors up to speed",
    desc: "Turn tribal knowledge into something anyone can read.",
    items: [
      { title: "Project structure walkthroughs", desc: "Ask what the project does and where to start reading." },
      { title: "README generation", desc: "Draft a professional README from what the repository actually contains." },
    ],
  },
  {
    tag: "04 — Operations",
    title: "Predictable and bounded",
    desc: "The workspace stays fast and the cost stays visible.",
    items: [
      { title: "Warm repository cache", desc: "Ingestion happens once; repeat visits open from cache immediately." },
      { title: "Visible request budget", desc: "A daily quota shown live in the workspace, with a fallback key behind it." },
    ],
  },
]
