/**
 * Repository intelligence: analyses that run over the whole repository and
 * produce a durable document, as opposed to the conversational assistant.
 *
 * Each insight is data — an id, presentation metadata and the instruction block
 * appended to the shared codebase context. `POST /api/insights` renders any of
 * them through one code path, so adding an analysis means adding an entry here,
 * never a new route or component.
 *
 * These reuse the Phase 2 context pipeline (cached whole-repository content,
 * trimmed and token-budgeted). They do **not** use semantic retrieval, which
 * does not exist yet — see the notebook's Phase 3 and D-18.
 */

export type InsightKind =
  | "architecture"
  | "modules"
  | "api"
  | "dependencies"
  | "onboarding"
  | "health"

export interface InsightDefinition {
  id: InsightKind
  /** Tab label in the workspace. */
  label: string
  /** One-line description shown before the analysis is run. */
  blurb: string
  /** Instruction block appended after the repository context. */
  instruction: string
}

/**
 * Shared rules every analysis inherits.
 *
 * The grounding clause matters most: these prompts ask for structure the model
 * is tempted to invent. Naming the "say what is missing" behaviour explicitly is
 * what keeps an architecture summary from becoming plausible fiction.
 */
const COMMON_RULES = `
GROUNDING RULES (apply to every section):
- Describe only what is present in the repository above. Never infer a file,
  module, endpoint or dependency that does not appear in the tree or content.
- Reference real paths exactly as they appear. Do not invent plausible-looking ones.
- Where the repository does not contain enough information to answer a section,
  write "Not determinable from the repository" under that heading and move on.
  A short honest answer is worth more than a complete invented one.
- Do not write new source code. Explain what exists; do not generate an
  implementation, a patch, or a file the project does not have.
- Use GitHub-flavoured markdown. Start directly with the first heading — no
  preamble, no "here is your…".
`

export const INSIGHTS: Record<InsightKind, InsightDefinition> = {
  architecture: {
    id: "architecture",
    label: "Architecture",
    blurb: "How the system is put together, in plain language, with a diagram.",
    instruction: `
Produce an ARCHITECTURE SUMMARY of this repository.

## Overview
Two or three sentences: what the system does and the shape it takes.

## Layers
The major layers or tiers, each with the directories that implement it.

## Request or data flow
A mermaid \`flowchart TD\` tracing one representative path end to end, using real
module names as node labels.

## Key components
A markdown table: | Component | Path | Responsibility |
Six rows at most, the ones that carry the most weight.

## Cross-cutting concerns
Configuration, logging, error handling, auth, caching — only those actually present.
`,
  },

  modules: {
    id: "modules",
    label: "Modules",
    blurb: "What each top-level module owns and how they depend on each other.",
    instruction: `
Produce a MODULE SUMMARY of this repository.

## Module map
A markdown table: | Module | Path | Owns | Depends on |
One row per significant top-level directory. "Depends on" lists sibling modules
only, judged from real imports.

## Notes
For the three most important modules, a short paragraph each on what lives there
and why a newcomer would open it.

## Boundaries
Any place where module responsibilities overlap or a dependency looks inverted.
Say so plainly, or write "No boundary problems evident".
`,
  },

  api: {
    id: "api",
    label: "API Explorer",
    blurb: "Every route the repository exposes, with method, path and purpose.",
    instruction: `
Produce an API REFERENCE for this repository.

## Endpoints
A markdown table: | Method | Path | Handler file | Purpose |
Include every HTTP route, CLI command or public entry point you can find. Derive
paths from routing files and framework conventions actually present.

## Request and response shapes
For the three most important endpoints, the input fields and the response shape,
taken from the code rather than assumed.

## Error behaviour
How failures are represented — status codes, error envelopes, error codes.

If the repository exposes no API surface, say so in one line and stop.
`,
  },

  dependencies: {
    id: "dependencies",
    label: "Dependencies",
    blurb: "External packages and how internal modules depend on one another.",
    instruction: `
Produce a DEPENDENCY ANALYSIS of this repository.

## External dependencies
A markdown table: | Package | Version | Used for | Where |
Read these from the real manifest files. Group by runtime vs development.

## Internal dependency graph
A mermaid \`flowchart LR\` of how internal modules import one another. Use real
directory names. Keep it to the significant edges.

## Observations
Anything notable and evidence-backed: unused declared dependencies, a package
pulled in by exactly one file, duplicated capability, or a heavy dependency used
lightly. Write "Nothing notable" rather than manufacturing a finding.
`,
  },

  onboarding: {
    id: "onboarding",
    label: "Onboarding",
    blurb: "A reading order and first-day guide for a new contributor.",
    instruction: `
Produce an ONBOARDING GUIDE for a developer joining this repository today.

## What this project is
Three sentences, no marketing language.

## Read these first
A numbered list of five to eight files in the order a newcomer should open them,
each with one sentence on why it earns its place. Order by dependency — entry
points before the code they call.

## Mental model
The three concepts someone must hold in their head before the code makes sense.

## Getting it running
The real setup steps, taken from the repository's own scripts, manifests and
configuration. If the repository does not document this, say so instead of
guessing commands.

## Good first tasks
Two or three genuinely approachable starting points, each naming the files
involved. Base these on TODOs, thin test coverage or obvious gaps actually
visible in the code.
`,
  },

  health: {
    id: "health",
    label: "Insights",
    blurb: "Structure, conventions and risks worth knowing before you change anything.",
    instruction: `
Produce a REPOSITORY INSIGHTS report.

## Composition
A markdown table: | Aspect | Finding |
Cover primary language, project type, approximate size, test presence, CI
presence, containerisation, and documentation depth. Base every row on files you
can actually see.

## Conventions
The patterns this codebase follows — naming, file layout, error handling, state
management. What a contributor should imitate.

## Risks
Concrete and evidence-backed: missing tests around important logic, configuration
committed to the repository, single points of failure, stale dependencies.
Each risk names the file or directory that shows it.

## Strengths
Two or three things this repository does well, with the evidence.
`,
  },
}

export const INSIGHT_ORDER: InsightKind[] = [
  "architecture",
  "modules",
  "api",
  "dependencies",
  "onboarding",
  "health",
]

export function isInsightKind(value: unknown): value is InsightKind {
  return typeof value === "string" && value in INSIGHTS
}

/** What gets cached: the document plus whether it saw the whole repository. */
export interface CachedInsight {
  markdown: string
  truncated: boolean
}

/**
 * Cache key for a rendered insight.
 *
 * Versioned so prompt edits invalidate old documents. v2 stores a JSON
 * `CachedInsight` rather than a bare markdown string, so the truncation caveat
 * survives a cache hit — a stale "complete" label on a partial analysis is
 * exactly the kind of quiet inaccuracy this product exists to avoid.
 */
export function insightCacheKey(username: string, repo: string, kind: InsightKind): string {
  return `insight:v2:${kind}:${username}:${repo}`
}

/** Assemble the instruction block appended after the repository context. */
export function buildInsightInstruction(kind: InsightKind): string {
  return `${INSIGHTS[kind].instruction}\n${COMMON_RULES}`
}
