import { beforeEach, describe, expect, it, vi } from "vitest"

/*
 * Every dependency that costs money, touches the network or needs a running
 * service is mocked. What is under test is the handler's decision-making:
 * what it validates, what it refuses, and the shape of what it returns.
 */

const rateLimit = {
  allowed: true,
  remaining: 19,
  limit: 20,
  resetAt: Math.floor(Date.now() / 1000) + 3600,
  degraded: false as boolean | undefined,
}

vi.mock("@/lib/rate-limiter", () => ({
  getClientIP: () => "test-ip",
  RateLimiter: {
    check: vi.fn(async () => rateLimit),
    increment: vi.fn(async () => rateLimit),
  },
}))

vi.mock("@/lib/redis-cache-manager", () => ({
  RedisCacheManager: {
    hasCache: vi.fn(async () => true),
    getFromCache: vi.fn(async () => ({ tree: "src/\n  index.ts", content: "console.log(1)" })),
  },
}))

vi.mock("@/lib/gemini", () => ({
  generateWithFallback: vi.fn(async () => "a grounded answer"),
  streamWithFallback: vi.fn(async function* () {
    yield "partial "
    yield "answer"
  }),
}))

vi.mock("@/lib/retrieval", () => ({
  retrieve: vi.fn(async () => ({ chunks: [], available: false })),
  buildRetrievedContext: vi.fn(() => ({ context: "", used: 0, omitted: 0 })),
}))

vi.mock("@/lib/github", () => ({
  fetchFileContent: vi.fn(async () => "file body"),
}))

import { POST } from "./route"
import { RateLimiter } from "@/lib/rate-limiter"
import { buildRetrievedContext, retrieve } from "@/lib/retrieval"

function post(body: unknown) {
  return new Request("http://localhost/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const valid = { username: "owner", repo: "name", query: "what is this?", history: [] }

beforeEach(() => {
  vi.clearAllMocks()
  rateLimit.allowed = true
  rateLimit.degraded = false
  vi.mocked(RateLimiter.check).mockResolvedValue({ ...rateLimit })
  vi.mocked(RateLimiter.increment).mockResolvedValue({ ...rateLimit })
  vi.mocked(retrieve).mockResolvedValue({ chunks: [], available: false })
})

describe("POST /api/gemini — validation", () => {
  it("rejects a missing repository", async () => {
    const body = await (await POST(post({ query: "hi" }))).json()
    expect(body.code).toBe("missing_parameters")
  })

  it("rejects an empty query", async () => {
    const body = await (await POST(post({ ...valid, query: "   " }))).json()
    expect(body.code).toBe("missing_parameters")
  })

  it("rejects path traversal in the owner", async () => {
    const res = await POST(post({ ...valid, username: "../.." }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe("invalid_request")
  })

  it("rejects a userinfo trick in the owner", async () => {
    const body = await (await POST(post({ ...valid, username: "a@evil.com" }))).json()
    expect(body.code).toBe("invalid_request")
  })

  it("refuses before spending quota", async () => {
    await POST(post({ ...valid, username: "../.." }))
    expect(RateLimiter.increment).not.toHaveBeenCalled()
  })
})

describe("POST /api/gemini — quota", () => {
  it("returns 429 with a stable code when the daily limit is reached", async () => {
    vi.mocked(RateLimiter.check).mockResolvedValue({ ...rateLimit, allowed: false })

    const res = await POST(post(valid))
    expect(res.status).toBe(429)
    expect((await res.json()).code).toBe("rate_limited")
  })

  it("returns 503 when the quota store is unreachable — it fails closed", async () => {
    vi.mocked(RateLimiter.check).mockResolvedValue({
      ...rateLimit, allowed: false, degraded: true,
    })

    const res = await POST(post(valid))
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe("quota_unavailable")
  })

  it("consumes quota only after a successful answer", async () => {
    await POST(post(valid))
    expect(RateLimiter.increment).toHaveBeenCalledOnce()
  })
})

describe("POST /api/gemini — success envelope", () => {
  it("returns the answer with usage and rate-limit metadata", async () => {
    const body = await (await POST(post(valid))).json()

    expect(body.success).toBe(true)
    expect(body.response).toBe("a grounded answer")
    expect(body.rateLimit).toBeDefined()
    expect(body.usage.estimatedPromptTokens).toBeGreaterThan(0)
  })

  it("reports that retrieval was not used when no index exists", async () => {
    const body = await (await POST(post(valid))).json()
    expect(body.usage.retrieval).toEqual({ used: false })
  })

  it("reports retrieval when the index answers", async () => {
    vi.mocked(retrieve).mockResolvedValue({
      available: true,
      chunks: [{
        path: "lib/a.ts", symbol: "f", language: "typescript", kind: "definition",
        start_line: 1, end_line: 9, text: "export function f() {}", score: 0.5,
      }],
    })
    vi.mocked(buildRetrievedContext).mockReturnValue({
      context: "--- lib/a.ts ---\nexport function f() {}", used: 1, omitted: 0,
    })

    const body = await (await POST(post(valid))).json()
    expect(body.usage.retrieval).toEqual({ used: true, chunks: 1 })
  })
})

describe("POST /api/gemini — streaming", () => {
  it("streams NDJSON when asked", async () => {
    const res = await POST(post({ ...valid, stream: true }))

    expect(res.headers.get("content-type")).toContain("x-ndjson")

    const events = (await res.text())
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))

    expect(events.filter((e) => e.type === "chunk").map((e) => e.text).join("")).toBe(
      "partial answer"
    )
    expect(events.at(-1).type).toBe("done")
    expect(events.at(-1).rateLimit).toBeDefined()
  })

  it("never streams a refusal — errors stay on the JSON envelope", async () => {
    vi.mocked(RateLimiter.check).mockResolvedValue({ ...rateLimit, allowed: false })

    const res = await POST(post({ ...valid, stream: true }))
    expect(res.headers.get("content-type")).toContain("application/json")
    expect((await res.json()).code).toBe("rate_limited")
  })

  it("leaves the non-streaming envelope unchanged", async () => {
    const res = await POST(post(valid))
    expect(res.headers.get("content-type")).toContain("application/json")
    expect(Object.keys(await res.json()).sort()).toEqual(
      ["rateLimit", "response", "success", "usage"]
    )
  })
})
