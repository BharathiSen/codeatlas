import { config as loadEnv } from "dotenv"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Answer-quality eval — the measurement the temperature decision was waiting on.
 *
 * `.eval.ts` deliberately does not match vitest's default include, so this never
 * runs as part of `pnpm test`: it makes real, billable model calls. Run it
 * explicitly:
 *
 *   VITEST_EVAL=true pnpm test
 *
 * D-26 measures whether the right chunks are *retrieved*. This measures whether
 * the answer built from them is *faithful and stable*, which is the only thing
 * temperature actually moves. Both use a fixture rather than a live repository
 * for the same reason: a benchmark you cannot re-run identically is an anecdote.
 *
 * Two scores, both computable without human judgement:
 *
 *   Citation validity — of every repository path the answer cites, what fraction
 *     exists? A hallucinated path is the failure mode that matters here, because
 *     the UI turns cited paths into links.
 *   Self-consistency — sampling the same question K times, how much do the
 *     answers agree? A factual question about fixed source should not produce a
 *     different story each time.
 */

loadEnv({ path: resolve(import.meta.dirname, "..", "..", ".env"), quiet: true })

/*
 * Imported lazily, after dotenv has run: `lib/gemini` constructs its clients at
 * module load, and a static import would hoist above the env load and build
 * them with an empty key.
 */
const gemini = () => import("@/lib/gemini")

const TEMPERATURES = [0.2, 0.8]
const SAMPLES = 3

/*
 * The free tier allows 15 generate_content requests per minute per model, and
 * both API keys bill the same project — so key failover buys nothing against a
 * rate limit, exactly as it buys nothing against a model retirement (D-17).
 * Firing the run flat out exhausts the minute partway through and throws away
 * every answer already paid for, which is the same failure the embedding
 * pipeline pauses to avoid.
 */
const REQUEST_SPACING_MS = 4_500
const MAX_ATTEMPTS = 4

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Seconds Gemini asked us to wait, if it said. */
function retryAfterMs(message: string): number | null {
  const match = message.match(/retry in ([\d.]+)s/i)
  return match ? Math.ceil(Number(match[1]) * 1000) : null
}

async function generatePaced(
  prompt: string,
  temperature: number
): Promise<string> {
  const { generateWithFallback } = await gemini()

  for (let attempt = 1; ; attempt++) {
    try {
      const answer = await generateWithFallback(prompt, { temperature })
      await sleep(REQUEST_SPACING_MS)
      return answer
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const rateLimited = message.includes("429")
      if (!rateLimited || attempt === MAX_ATTEMPTS) throw error

      const wait = retryAfterMs(message) ?? 2 ** attempt * 5_000
      console.log(`    rate limited, waiting ${Math.round(wait / 1000)}s (attempt ${attempt})`)
      await sleep(wait)
    }
  }
}

/** A small fixture with unambiguous, citable homes for each concern. */
const FILES: Record<string, string> = {
  "src/auth/session.ts": `import { readToken } from "./token"

/** Rejects an expired or malformed token; returns the user id otherwise. */
export function validateSession(raw: string): string | null {
  const token = readToken(raw)
  if (!token) return null
  if (token.expiresAt < Date.now()) return null
  return token.userId
}`,
  "src/auth/token.ts": `export interface Token { userId: string; expiresAt: number }

export function readToken(raw: string): Token | null {
  try { return JSON.parse(atob(raw)) as Token } catch { return null }
}`,
  "src/billing/invoice.ts": `import { validateSession } from "../auth/session"

/** Totals an invoice. Line amounts are integer cents; never floats. */
export function totalInvoice(session: string, lines: number[]): number {
  if (!validateSession(session)) throw new Error("unauthorised")
  return lines.reduce((sum, cents) => sum + cents, 0)
}`,
  "src/storage/cache.ts": `const store = new Map<string, { value: string; expiresAt: number }>()

export function put(key: string, value: string, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs })
}

export function get(key: string): string | null {
  const hit = store.get(key)
  if (!hit || hit.expiresAt < Date.now()) return null
  return hit.value
}`,
}

const TREE = Object.keys(FILES).sort().join("\n")

const CONTENT = Object.entries(FILES)
  .map(([path, body]) => `====\nFILE: ${path}\n====\n${body}`)
  .join("\n\n")

interface Question {
  ask: string
  /** The file a correct answer has to point at. */
  expects: string
}

const QUESTIONS: Question[] = [
  { ask: "Where is a session token validated, and what makes it invalid?", expects: "src/auth/session.ts" },
  { ask: "How are invoice amounts represented, and why?", expects: "src/billing/invoice.ts" },
  { ask: "How does the cache decide an entry has expired?", expects: "src/storage/cache.ts" },
]

function buildPrompt(question: string): string {
  return `You are a code comprehension assistant. Answer only from the repository below.

USER QUERY: ${question}

FOLDER STRUCTURE:
${TREE}

FILE CONTENT:
${CONTENT}

INSTRUCTIONS:
- Answer in at most four sentences.
- Cite the file paths you relied on, each wrapped in backticks.
- If the repository does not contain the answer, say so plainly.`
}

/** Backticked tokens that look like a repository path. */
function citedPaths(answer: string): string[] {
  const found = answer.match(/`([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)`/g) ?? []
  return [...new Set(found.map((m) => m.slice(1, -1)))]
}

/** Jaccard over content words — a blunt but honest agreement measure. */
function agreement(a: string, b: string): number {
  const words = (t: string) =>
    new Set(
      t.toLowerCase().replace(/[^a-z0-9/._ -]/g, " ").split(/\s+/).filter((w) => w.length > 3)
    )
  const x = words(a)
  const y = words(b)
  if (x.size === 0 || y.size === 0) return 0
  const shared = [...x].filter((w) => y.has(w)).length
  return shared / (x.size + y.size - shared)
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

interface Score {
  citationValidity: number
  grounded: number
  consistency: number
}

async function scoreTemperature(temperature: number): Promise<Score> {
  const validity: number[] = []
  const grounded: number[] = []
  const consistency: number[] = []

  for (const question of QUESTIONS) {
    const prompt = buildPrompt(question.ask)

    const answers: string[] = []
    for (let i = 0; i < SAMPLES; i++) {
      answers.push(await generatePaced(prompt, temperature))
    }

    for (const answer of answers) {
      const cited = citedPaths(answer)
      // No citation at all is not a hallucination, but it is not grounded either.
      validity.push(cited.length === 0 ? 0 : cited.filter((p) => p in FILES).length / cited.length)
      grounded.push(cited.includes(question.expects) ? 1 : 0)
    }

    for (let i = 0; i < answers.length; i++) {
      for (let j = i + 1; j < answers.length; j++) {
        consistency.push(agreement(answers[i], answers[j]))
      }
    }
  }

  return {
    citationValidity: mean(validity),
    grounded: mean(grounded),
    consistency: mean(consistency),
  }
}

describe("answer quality across temperature", () => {
  it(
    "measures citation validity, grounding and self-consistency",
    async () => {
      const rows: Array<[number, Score]> = []

      for (const temperature of TEMPERATURES) {
        rows.push([temperature, await scoreTemperature(temperature)])
      }

      const fmt = (n: number) => n.toFixed(3)
      console.log(
        `\n  ${QUESTIONS.length} questions x ${SAMPLES} samples, model calls: ` +
          `${QUESTIONS.length * SAMPLES * TEMPERATURES.length}\n`
      )
      console.log("  temp   citation-validity   grounded   self-consistency")
      for (const [temperature, s] of rows) {
        console.log(
          `  ${temperature.toFixed(1)}    ${fmt(s.citationValidity).padStart(11)}` +
            `   ${fmt(s.grounded).padStart(8)}   ${fmt(s.consistency).padStart(14)}`
        )
      }
      console.log("")

      // The eval is a measurement, not a threshold — but a run that produced no
      // usable answers measured nothing and must not read as a pass.
      for (const [, s] of rows) {
        expect(s.citationValidity).toBeGreaterThan(0)
      }
    },
    10 * 60 * 1000
  )
})
