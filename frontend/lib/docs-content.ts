/**
 * Content for the documentation reader at `/docs`.
 *
 * Sections render from this array so the page holds one template rather than
 * repeated markup. Everything here describes the project as it actually is —
 * the real environment variables, routes and commands.
 */

export interface DocBlock {
  kind: "p" | "h3" | "code" | "list"
  text?: string
  lines?: string[]
}

export interface DocSection {
  id: string
  title: string
  group: string
  blocks: DocBlock[]
}

export const DOC_SECTIONS: DocSection[] = [
  {
    id: "quickstart",
    title: "Quickstart",
    group: "Getting Started",
    blocks: [
      {
        kind: "p",
        text: "CodeAtlas runs as two services: a Next.js web application and a Python ingestion service. Both need to be running before you can map a repository.",
      },
      { kind: "h3", text: "1. Install dependencies" },
      {
        kind: "code",
        lines: [
          "cd frontend && pnpm install",
          "pip install -r backend/requirements.txt",
        ],
      },
      { kind: "h3", text: "2. Configure the environment" },
      { kind: "code", lines: ["cp .env.example frontend/.env.local"] },
      {
        kind: "p",
        text: "Fill in a Gemini API key, a GitHub token, the ingestion service URL and a Redis connection string. See Configuration below.",
      },
      { kind: "h3", text: "3. Run both services" },
      {
        kind: "code",
        lines: [
          "# terminal 1 — ingestion service",
          "uvicorn main:app --reload --port 8000 --app-dir backend",
          "",
          "# terminal 2 — web application",
          "cd frontend && pnpm dev",
        ],
      },
      {
        kind: "p",
        text: "Open http://localhost:3000, paste a public GitHub repository, and the workspace opens at /{owner}/{name}.",
      },
    ],
  },
  {
    id: "requirements",
    title: "Requirements",
    group: "Getting Started",
    blocks: [
      {
        kind: "list",
        lines: [
          "Node.js 18 or newer, with pnpm",
          "Python 3.10 or newer",
          "A Redis instance — backs both the repository cache and the request quota",
          "A Google Gemini API key",
          "A GitHub personal access token (public_repo scope is sufficient)",
        ],
      },
    ],
  },
  {
    id: "concepts",
    title: "Core concepts",
    group: "Getting Started",
    blocks: [
      { kind: "h3", text: "Whole-repository context" },
      {
        kind: "p",
        text: "CodeAtlas ingests the entire repository in a single pass rather than reading one file at a time. The full tree and file contents become the context every answer is grounded in.",
      },
      { kind: "h3", text: "The workspace" },
      {
        kind: "p",
        text: "Each repository opens a three-pane workspace: a file explorer, a viewer that renders source, notebooks and PDFs, and the assistant. All three share one context.",
      },
      { kind: "h3", text: "Warm cache" },
      {
        kind: "p",
        text: "Ingestion happens once and the result is cached in Redis for six hours, so returning to a repository opens immediately instead of re-ingesting.",
      },
    ],
  },
  {
    id: "mapping",
    title: "Mapping a repository",
    group: "Usage",
    blocks: [
      {
        kind: "p",
        text: "Enter a repository as a full GitHub URL or as owner/name. CodeAtlas ingests it, caches the result, then routes you to its workspace.",
      },
      { kind: "code", lines: ["github.com/vercel/next.js", "vercel/next.js"] },
      {
        kind: "p",
        text: "Ingestion runs inline and is bounded at 120 seconds. Very large repositories may exceed that — see Known Limitations in the engineering notebook.",
      },
    ],
  },
  {
    id: "asking",
    title: "Asking questions",
    group: "Usage",
    blocks: [
      {
        kind: "p",
        text: "The assistant is scoped to the open repository and rewards architectural questions over lookups.",
      },
      {
        kind: "list",
        lines: [
          "Explain the project structure and what it does",
          "Draw the request flow as a sequence diagram",
          "What are the main dependencies, and why is each one here?",
          "Which files would I need to touch to add X?",
          "Explain this file — with a file selected in the explorer",
        ],
      },
      {
        kind: "p",
        text: "Architecture questions return Mermaid diagrams. Selecting a file first scopes the question to that file while keeping the surrounding context.",
      },
    ],
  },
  {
    id: "configuration",
    title: "Configuration",
    group: "Reference",
    blocks: [
      {
        kind: "p",
        text: "Every setting is an environment variable. Leave an optional variable unset and its feature switches off cleanly — no identifier is hardcoded anywhere.",
      },
      { kind: "h3", text: "Required" },
      {
        kind: "list",
        lines: [
          "GEMINI_API_KEY — the answering model",
          "GITHUB_TOKEN — repository metadata and file reads",
          "GITINGEST_API_URL — base URL of the ingestion service",
          "REDIS_URL — repository cache and rate-limit store",
          "NEXT_PUBLIC_APP_URL — public base URL of this deployment",
        ],
      },
      { kind: "h3", text: "Optional" },
      {
        kind: "list",
        lines: [
          "GEMINI_API_KEY_SECONDARY — failover key used when the primary is rate-limited",
          "NEXT_PUBLIC_CODEATLAS_REPO_OWNER / _NAME — shows a star count in the workspace header",
          "NEXT_PUBLIC_RYBBIT_SITE_ID — enables analytics; blank disables it",
        ],
      },
    ],
  },
  {
    id: "api",
    title: "API reference",
    group: "Reference",
    blocks: [
      {
        kind: "p",
        text: "All routes return a { success, data?, error? } envelope. None are versioned or authenticated yet.",
      },
      { kind: "h3", text: "POST /api/collect-repo-data" },
      {
        kind: "p",
        text: "Ingests a repository or serves it from cache. Accepts { username, repo, force_refresh? }. Returns { success, cached, data }.",
      },
      { kind: "h3", text: "POST /api/gemini" },
      {
        kind: "p",
        text: "The answering endpoint. Accepts { username, repo, query, filePath?, fetchOnlyCurrentFile?, history? } and returns { success, response, rateLimit }. Responds 429 when the daily quota is exhausted.",
      },
      { kind: "h3", text: "GET /api/file-content" },
      {
        kind: "p",
        text: "Fetches a single file by ?path=&username=&repo=. Binary files are returned base64-encoded for the client to decode.",
      },
      { kind: "h3", text: "GET /api/rate-limit" },
      {
        kind: "p",
        text: "Returns the caller's current quota without incrementing it.",
      },
    ],
  },
  {
    id: "architecture",
    title: "Architecture",
    group: "Reference",
    blocks: [
      {
        kind: "p",
        text: "The web application owns all state; the ingestion service is stateless. Cache and quota both live in Redis, reachable only from the web application.",
      },
      {
        kind: "p",
        text: "docs/ENGINEERING_NOTEBOOK.md is the single source of truth for architecture, roadmap, known limitations and recorded decisions. Read it before contributing.",
      },
    ],
  },
]

export const DOC_GROUPS = ["Getting Started", "Usage", "Reference"] as const
