import { beforeEach, describe, expect, it, vi } from "vitest"

/*
 * The OAuth round-trip itself needs a live provider and is not tested here.
 * What is tested is the part that decides who pays for a request — the mapping
 * from a session (or its absence, or its failure) to a quota bucket. That is
 * where a mistake costs money, and none of it needs GitHub.
 */

// `vi.hoisted` so the stub exists before the mock factory (which is hoisted
// above the imports) runs.
const { authFn } = vi.hoisted(() => ({ authFn: vi.fn() }))

vi.mock("next-auth", () => ({
  default: () => ({
    handlers: { GET: vi.fn(), POST: vi.fn() },
    auth: authFn,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}))

vi.mock("next-auth/providers/github", () => ({ default: () => ({ id: "github" }) }))

import { getQuotaSubject, ipQuotaSubject, isAuthConfigured, userQuotaSubject } from "./auth"

const req = (headers: Record<string, string> = {}) =>
  new Request("https://example.com/api/gemini", { headers })

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.AUTH_GITHUB_ID
  delete process.env.AUTH_GITHUB_SECRET
})

describe("quota subjects", () => {
  it("namespaces users and addresses so they cannot collide", () => {
    // Without the prefix, a user whose id happened to look like an address
    // would share that address's bucket.
    expect(userQuotaSubject("4242")).toBe("user:4242")
    expect(ipQuotaSubject("4242")).toBe("ip:4242")
    expect(userQuotaSubject("4242")).not.toBe(ipQuotaSubject("4242"))
  })
})

describe("getQuotaSubject", () => {
  it("bills a signed-in caller to their own account", async () => {
    authFn.mockResolvedValue({ user: { id: "4242", name: "Ada" } })

    expect(await getQuotaSubject(req())).toBe("user:4242")
  })

  it("falls back to the anonymous bucket when there is no session", async () => {
    authFn.mockResolvedValue(null)

    expect(await getQuotaSubject(req())).toBe("ip:unknown")
  })

  it("falls back when a session exists but carries no id", async () => {
    // A provider that returns a profile without a stable id must not produce
    // the subject `user:undefined`, which every such caller would share.
    authFn.mockResolvedValue({ user: { name: "Ada" } })

    expect(await getQuotaSubject(req())).toBe("ip:unknown")
  })

  it("falls back to a bucket — never to no bucket — when auth throws", async () => {
    // A misconfigured or unreachable provider must not open the quota. This is
    // the failure that would otherwise make every request free.
    authFn.mockRejectedValue(new Error("UntrustedHost"))

    expect(await getQuotaSubject(req())).toBe("ip:unknown")
  })

  it("ignores a spoofed forwarding header when no proxy is trusted", async () => {
    authFn.mockResolvedValue(null)

    expect(await getQuotaSubject(req({ "x-forwarded-for": "1.2.3.4" }))).toBe("ip:unknown")
  })
})

describe("isAuthConfigured", () => {
  it("is false when no GitHub credentials are present", () => {
    expect(isAuthConfigured()).toBe(false)
  })

  it("is false when only one half of the credential pair is set", () => {
    process.env.AUTH_GITHUB_ID = "id"
    expect(isAuthConfigured()).toBe(false)
  })

  it("is true once both are set", () => {
    process.env.AUTH_GITHUB_ID = "id"
    process.env.AUTH_GITHUB_SECRET = "secret"
    expect(isAuthConfigured()).toBe(true)
  })
})
