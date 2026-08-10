import { beforeEach, describe, expect, it, vi } from "vitest"
// `vi.mock` is hoisted above imports, so the fake below is in place before
// rate-limiter pulls in ioredis.
import { getClientIP, RateLimiter } from "./rate-limiter"

/**
 * In-memory stand-in for the bits of ioredis the limiter uses. `failing` makes
 * every call throw so the degraded posture can be exercised.
 */
const store = new Map<string, number>()
const ttls = new Map<string, number>()
let failing = false

vi.mock("ioredis", () => {
  class FakeRedis {
    on() {}
    async incr(key: string) {
      if (failing) throw new Error("redis down")
      const next = (store.get(key) ?? 0) + 1
      store.set(key, next)
      return next
    }
    async get(key: string) {
      if (failing) throw new Error("redis down")
      const v = store.get(key)
      return v === undefined ? null : String(v)
    }
    async expire(key: string, seconds: number) {
      if (failing) throw new Error("redis down")
      ttls.set(key, seconds)
      return 1
    }
    async ttl(key: string) {
      if (failing) throw new Error("redis down")
      return ttls.get(key) ?? -1
    }
  }
  return { Redis: FakeRedis, default: FakeRedis }
})

// Read lazily inside RateLimiter.getClient(), so setting it here is enough.
process.env.REDIS_URL = "redis://localhost:6379"

beforeEach(() => {
  store.clear()
  ttls.clear()
  failing = false
  // The limiter memoises its client; clear it so each test starts clean.
  ;(RateLimiter as unknown as { redis?: unknown }).redis = undefined
})

describe("getClientIP", () => {
  const req = (headers: Record<string, string>) =>
    new Request("https://example.com", { headers })

  it("prefers the first x-forwarded-for entry", () => {
    expect(getClientIP(req({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4")
  })

  it("falls back to x-real-ip", () => {
    expect(getClientIP(req({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9")
  })

  it("returns 'unknown' when neither header is present", () => {
    expect(getClientIP(req({}))).toBe("unknown")
  })
})

describe("RateLimiter", () => {
  it("reports a full quota before any request", async () => {
    const info = await RateLimiter.check("ip-a")

    expect(info.allowed).toBe(true)
    expect(info.remaining).toBe(info.limit)
  })

  it("consumes quota on increment", async () => {
    await RateLimiter.increment("ip-b")
    const info = await RateLimiter.check("ip-b")

    expect(info.remaining).toBe(info.limit - 1)
  })

  it("counts concurrent increments without losing any", async () => {
    // The old read-modify-write lost increments here; INCR must not.
    await Promise.all(Array.from({ length: 10 }, () => RateLimiter.increment("ip-c")))
    const info = await RateLimiter.check("ip-c")

    expect(info.remaining).toBe(info.limit - 10)
  })

  it("refuses once the limit is reached", async () => {
    const limit = (await RateLimiter.check("ip-d")).limit
    for (let i = 0; i < limit; i++) await RateLimiter.increment("ip-d")

    const info = await RateLimiter.check("ip-d")
    expect(info.allowed).toBe(false)
    expect(info.remaining).toBe(0)
  })

  it("keeps remaining at zero rather than going negative", async () => {
    const limit = (await RateLimiter.check("ip-e")).limit
    for (let i = 0; i < limit + 5; i++) await RateLimiter.increment("ip-e")

    expect((await RateLimiter.check("ip-e")).remaining).toBe(0)
  })

  it("fails closed and flags degradation when Redis is unreachable", async () => {
    failing = true
    const info = await RateLimiter.check("ip-f")

    expect(info.degraded).toBe(true)
    expect(info.allowed).toBe(false)
  })
})
