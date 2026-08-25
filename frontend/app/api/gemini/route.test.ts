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

vi.mock("@/lib/auth", () => ({
  // Identity resolution is exercised in lib/auth's own surface; here the
  // handler only needs a stable subject to key the quota on.
  getQuotaSubject: async () => "ip:test-ip",
}))

vi.mock("@/lib/rate-limiter", () => ({
  RateLimiter: {
    check: vi.fn(async () => rateLimit),
    increment: vi.fn(async () => rateLimit),
  },
}))

vi.mock("@/lib/redis-cache-manager", () => ({
  RedisCacheManager: {
    hasCache: vi.fn(async () => true),
    getFromCache: vi.fn(async () => ({ tree: "src/\n  index.ts", content: "console.log(1)" })),
    // Answer cache: a miss by default, so most tests exercise the generating path.
    getRaw: vi.fn(async () => null),
    saveRaw: vi.fn(async () => {}),
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
import { RedisCacheManager } from "@/lib/redis-cache-manager"
import { generateWithFallback } from "@/lib/gemini"
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
  vi.mocked(RedisCacheManager.getRaw).mockResolvedValue(null)
  // Reset explicitly: `clearAllMocks` clears calls but keeps implementations, so
  // a test that makes the repository cache miss would otherwise leak that into
  // every test declared after it.
  vi.mocked(RedisCacheManager.hasCache).mockResolvedValue(true)
  vi.mocked(RedisCacheManager.getFromCache).mockResolvedValue({
    tree: "src/\n  index.ts",
    content: "console.log(1)",
  })
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

  it("reports that retrieval was not used when the service is unreachable", async () => {
    vi.mocked(retrieve).mockResolvedValue({
      chunks: [], available: false, reason: "unavailable",
    })

    const body = await (await POST(post(valid))).json()
    expect(body.usage.retrieval).toEqual({ used: false, reason: "unavailable" })
  })

  it("distinguishes an un-indexed repository from a broken retrieval service", async () => {
    /*
     * Both degrade to whole-repository context, deliberately — but they mean
     * completely different things to whoever is reading the logs. Conflating
     * them is how retrieval stayed silently broken in production (D-42).
     */
    vi.mocked(retrieve).mockResolvedValue({
      chunks: [], available: false, reason: "no_matches",
    })

    const body = await (await POST(post(valid))).json()
    expect(body.usage.retrieval).toEqual({ used: false, reason: "no_matches" })
    expect(body.success).toBe(true) // still answers — the fallback is not a failure
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

  /*
   * D-48. These two paths never call retrieval at all. They used to report
   * `reason: 'unavailable'` anyway, because the reason defaulted when unset —
   * so "we did not ask" was indistinguishable from "the vector store is down",
   * which is the ambiguity D-44 added this field to remove.
   */
  it("reports a file-scoped question as a deliberate skip, not an outage", async () => {
    const body = await (
      await POST(post({ ...valid, filePath: "lib/a.ts", fetchOnlyCurrentFile: true }))
    ).json()

    expect(body.usage.retrieval).toEqual({ used: false, reason: "file_scoped" })
    expect(retrieve).not.toHaveBeenCalled()
  })

  it("reports absent repository context as not attempted, not unavailable", async () => {
    // hasCache says yes, getFromCache says no — the key lapsed between the two.
    // There is nothing to retrieve against, so retrieval is never reached.
    vi.mocked(RedisCacheManager.getFromCache).mockResolvedValue(null)

    const body = await (await POST(post(valid))).json()

    expect(body.usage.retrieval).toEqual({ used: false, reason: "not_attempted" })
    expect(retrieve).not.toHaveBeenCalled()
    expect(body.success).toBe(true) // still answers
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
      ["conversationId", "rateLimit", "requestId", "response", "success", "usage"]
    )
  })
})

describe("POST /api/gemini — answer cache", () => {
  const cached = JSON.stringify({
    response: "a cached answer",
    usage: { estimatedPromptTokens: 10, truncated: false, historyTurns: 0, retrieval: { used: false } },
  })

  it("serves a repeat question without calling the model", async () => {
    vi.mocked(RedisCacheManager.getRaw).mockResolvedValue(cached)

    const body = await (await POST(post(valid))).json()

    expect(body.response).toBe("a cached answer")
    expect(body.cached).toBe(true)
    expect(generateWithFallback).not.toHaveBeenCalled()
  })

  it("does not charge quota for a cache hit", async () => {
    vi.mocked(RedisCacheManager.getRaw).mockResolvedValue(cached)

    await POST(post(valid))

    expect(RateLimiter.increment).not.toHaveBeenCalled()
  })

  it("stores an answer it had to generate", async () => {
    await POST(post(valid))

    expect(RedisCacheManager.saveRaw).toHaveBeenCalledOnce()
    const [key, value] = vi.mocked(RedisCacheManager.saveRaw).mock.calls[0]
    expect(key).toMatch(/^answer:v1:owner:name:/)
    expect(JSON.parse(value).response).toBe("a grounded answer")
  })

  it("never caches a follow-up", async () => {
    // The same words mean different things after different history.
    await POST(post({ ...valid, history: [{ role: "user", content: "earlier" }] }))

    expect(RedisCacheManager.getRaw).not.toHaveBeenCalled()
    expect(RedisCacheManager.saveRaw).not.toHaveBeenCalled()
  })

  it("never caches a file-scoped question", async () => {
    await POST(post({ ...valid, filePath: "a.ts", fetchOnlyCurrentFile: true }))

    expect(RedisCacheManager.saveRaw).not.toHaveBeenCalled()
  })

  it("falls back to generating when the cached entry is corrupt", async () => {
    vi.mocked(RedisCacheManager.getRaw).mockResolvedValue("{not json")

    const body = await (await POST(post(valid))).json()

    expect(body.response).toBe("a grounded answer")
  })

  it("replays a cached answer as NDJSON when streaming was requested", async () => {
    // A streaming client must not need a special case for a cache hit.
    vi.mocked(RedisCacheManager.getRaw).mockResolvedValue(cached)

    const res = await POST(post({ ...valid, stream: true }))
    expect(res.headers.get("content-type")).toContain("x-ndjson")

    const events = (await res.text())
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l))
    expect(events[0]).toEqual({ type: "chunk", text: "a cached answer" })
    expect(events.at(-1).type).toBe("done")
  })

  it("caches an answer that was streamed", async () => {
    // Otherwise whether a question is billed twice depends on the transport.
    // The stream must be drained first — `start()` runs as the body is read.
    await (await POST(post({ ...valid, stream: true }))).text()

    expect(RedisCacheManager.saveRaw).toHaveBeenCalledOnce()
    expect(JSON.parse(vi.mocked(RedisCacheManager.saveRaw).mock.calls[0][1]).response).toBe(
      "partial answer"
    )
  })
})

describe("POST /api/gemini — request correlation", () => {
  it("returns an id on the success envelope and header", async () => {
    const res = await POST(post(valid))
    const body = await res.json()

    expect(body.requestId).toEqual(expect.any(String))
    expect(res.headers.get("x-request-id")).toBe(body.requestId)
  })

  it("returns an id on a refusal too", async () => {
    const res = await POST(post({ query: "hi" }))
    expect((await res.json()).requestId).toEqual(expect.any(String))
  })

  it("adopts a caller-supplied id so one identifier spans the hop", async () => {
    const req = new Request("http://localhost/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-request-id": "trace-abc123" },
      body: JSON.stringify(valid),
    })

    expect((await (await POST(req)).json()).requestId).toBe("trace-abc123")
  })

  it("rejects an unreasonable caller id rather than logging it", async () => {
    const req = new Request("http://localhost/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-request-id": "x".repeat(500) },
      body: JSON.stringify(valid),
    })

    expect((await (await POST(req)).json()).requestId).not.toContain("xxxx")
  })
})
