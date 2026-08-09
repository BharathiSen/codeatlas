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
  items: string[]
}

export interface ShowcaseTab {
  id: string
  label: string
}

export interface ComparisonRow {
  label: string
  chatgpt: string
  copilot: string
  codeatlas: string
}

export interface Feature {
  tag: string
  title: string
  desc: string
}

export interface FeatureGroup {
  tag: string
  title: string
  desc: string
  items: { title: string; desc: string }[]
}

export const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Home" },
  { href: "/features", label: "Features" },
  { href: "/docs", label: "Documentation" },
]

export const EXAMPLE_REPOS = [
  "vercel/next.js",
  "facebook/react",
  "fastapi/fastapi",
  "kubernetes/kubernetes",
]

export const PIPELINE_STEPS: PipelineStep[] = [
  {
    num: "01",
    title: "Ingest",
    items: [
      "Clone the repository.",
      "Read source code, documentation, notebooks, configuration files, and project metadata.",
      "Build one coherent understanding of the repository.",
    ],
  },
  {
    num: "02",
    title: "Index",
    items: [
      "Parse the repository.",
      "Build semantic context from the full tree and contents.",
      "Cache the repository so future questions reuse the same indexed knowledge.",
    ],
  },
  {
    num: "03",
    title: "Interrogate",
    items: [
      "Developers ask natural language questions.",
      "Answers are grounded in repository context.",
      "Responses cite files, functions, modules, and generate Mermaid diagrams where appropriate.",
    ],
  },
]

export const SHOWCASE_TABS: ShowcaseTab[] = [
  { id: "overview", label: "Repository Overview" },
  { id: "architecture", label: "Architecture Summary" },
  { id: "chat", label: "Repository Chat" },
  { id: "api", label: "API Explorer" },
  { id: "module", label: "Module Explorer" },
  { id: "search", label: "Code Search" },
  { id: "mermaid", label: "Mermaid Diagrams" },
  { id: "languages", label: "Supported Languages" },
]

export const COMPARISON_ROWS: ComparisonRow[] = [
  { label: "Understands full repository context", chatgpt: "No", copilot: "Partial", codeatlas: "Yes" },
  { label: "Persistent repository memory", chatgpt: "No", copilot: "No", codeatlas: "Yes" },
  { label: "Cites files, functions, modules", chatgpt: "No", copilot: "No", codeatlas: "Yes" },
  { label: "Architecture diagram generation", chatgpt: "No", copilot: "No", codeatlas: "Yes" },
  { label: "Primary purpose", chatgpt: "General chat", copilot: "Code completion", codeatlas: "Repo understanding" },
]

export const FEATURES: Feature[] = [
  { tag: "01", title: "Grounded answers", desc: "Every response is grounded in the whole repository, not a single open file." },
  { tag: "02", title: "Repository-wide context", desc: "The full tree and contents are ingested in one pass and reused for every question." },
  { tag: "03", title: "Architecture summaries", desc: "A generated overview of how the system is structured, in plain language." },
  { tag: "04", title: "File citations", desc: "Answers reference the real paths the explanation came from." },
  { tag: "05", title: "API flow explanations", desc: "Trace a request through handlers, services, and data layers." },
  { tag: "06", title: "Mermaid diagram generation", desc: "Architecture and sequence diagrams generated directly from source." },
  { tag: "07", title: "Notebook and PDF support", desc: "Jupyter notebooks and PDFs render in place alongside source files." },
  { tag: "08", title: "Code navigation", desc: "Browse the tree and open any file next to the assistant explaining it." },
  { tag: "09", title: "Repository caching", desc: "One ingestion keeps the workspace warm so repeat visits open immediately." },
  { tag: "10", title: "README generation", desc: "Draft a professional README from what the repository actually contains." },
  { tag: "11", title: "Bounded usage", desc: "A visible daily request budget, with a fallback key behind it." },
  { tag: "12", title: "Zero setup", desc: "Paste any public repository and the workspace opens — no install, no config." },
]

export const FILE_TYPES = [
  ".py .ts .go .rs",
  "Markdown",
  "Documentation",
  "PDFs",
  "Jupyter notebooks",
  "Config files",
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
