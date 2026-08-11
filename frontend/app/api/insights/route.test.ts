import { beforeEach, describe, expect, it, vi } from "vitest"

const rateLimit = { allowed: true, remaining: 19, limit: 20, resetAt: 0, degraded: false }

vi.mock("@/lib/rate-limiter", () => ({
  getClientIP: () => "test-ip",
  RateLimiter: {
    check: vi.fn(async () => rateLimit),
    increment: vi.fn(async () => rateLimit),
  },
}))

const cache = { raw: null as string | null, repo: { tree: "src/", content: "code" } as unknown }

vi.mock("@/lib/redis-cache-manager", () => ({
  RedisCacheManager: {
    getRaw: vi.fn(async () => cache.raw),
    saveRaw: vi.fn(async () => undefined),
    getFromCache: vi.fn(async () => cache.repo),
  },
}))

vi.mock("@/lib/gemini", () => ({
  generateWithFallback: vi.fn(async () => "## Overview\nGenerated analysis."),
}))

import type { NextRequest } from "next/server"
import { POST } from "./route"
import { RateLimiter } from "@/lib/rate-limiter"
import { RedisCacheManager } from "@/lib/redis-cache-manager"
import { generateWithFallback } from "@/lib/gemini"

const post = (body: unknown) =>
  new Request("http://localhost/api/insights", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest

const valid = { username: "owner", repo: "name", kind: "architecture" }

beforeEach(() => {
  vi.clearAllMocks()
  cache.raw = null
  cache.repo = { tree: "src/", content: "code" }
  vi.mocked(RateLimiter.check).mockResolvedValue({ ...rateLimit })
})

describe("POST /api/insights — validation", () => {
  it("requires username, repo and kind", async () => {
    expect((await (await POST(post({}))).json()).code).toBe("missing_parameters")
  })

  it("rejects an unknown analysis kind", async () => {
    const body = await (await POST(post({ ...valid, kind: "bogus" }))).json()
    expect(body.code).toBe("invalid_request")
  })

  it("rejects an invalid repository name", async () => {
    const body = await (await POST(post({ ...valid, username: "../.." }))).json()
    expect(body.code).toBe("invalid_request")
  })

  it("refuses when the repository has not been ingested", async () => {
    cache.repo = null
    const res = await POST(post(valid))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe("repo_not_found")
  })
})

describe("POST /api/insights — caching", () => {
  it("generates and stores on a cache miss", async () => {
    const body = await (await POST(post(valid))).json()

    expect(body.success).toBe(true)
    expect(body.cached).toBe(false)
    expect(generateWithFallback).toHaveBeenCalledOnce()
    expect(RedisCacheManager.saveRaw).toHaveBeenCalledOnce()
  })

  it("serves a cache hit without generating or spending quota", async () => {
    cache.raw = JSON.stringify({ markdown: "## Cached", truncated: false })

    const body = await (await POST(post(valid))).json()

    expect(body.cached).toBe(true)
    expect(body.data.markdown).toBe("## Cached")
    expect(generateWithFallback).not.toHaveBeenCalled()
    expect(RateLimiter.increment).not.toHaveBeenCalled()
  })

  it("preserves the truncation flag across a cache hit", async () => {
    // A partial analysis must never be presented as complete on reload.
    cache.raw = JSON.stringify({ markdown: "## Partial", truncated: true })

    const body = await (await POST(post(valid))).json()
    expect(body.usage.truncated).toBe(true)
  })

  it("regenerates when force_refresh is set", async () => {
    cache.raw = JSON.stringify({ markdown: "## Old", truncated: false })

    const body = await (await POST(post({ ...valid, force_refresh: true }))).json()

    expect(body.cached).toBe(false)
    expect(generateWithFallback).toHaveBeenCalledOnce()
  })

  it("regenerates rather than serving an unparsable cache entry", async () => {
    cache.raw = "not json"

    const body = await (await POST(post(valid))).json()
    expect(body.success).toBe(true)
    expect(generateWithFallback).toHaveBeenCalledOnce()
  })
})

describe("POST /api/insights — quota", () => {
  it("returns 429 when the daily limit is reached", async () => {
    vi.mocked(RateLimiter.check).mockResolvedValue({ ...rateLimit, allowed: false })
    expect((await POST(post(valid))).status).toBe(429)
  })

  it("fails closed when the quota store is unreachable", async () => {
    vi.mocked(RateLimiter.check).mockResolvedValue({
      ...rateLimit, allowed: false, degraded: true,
    })
    const res = await POST(post(valid))
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe("quota_unavailable")
  })
})
