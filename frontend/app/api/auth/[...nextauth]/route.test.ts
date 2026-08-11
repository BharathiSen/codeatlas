import { beforeEach, describe, expect, it, vi } from "vitest"

/*
 * Regression: unconfigured, these routes were mounted anyway and every action
 * answered 500 on a missing client id. Found by probing a running server, so it
 * gets a test.
 */

// `vi.hoisted` so these exist before the mock factory, which is hoisted above
// the imports, evaluates.
const { configured, GET_HANDLER, POST_HANDLER } = vi.hoisted(() => ({
  configured: vi.fn(() => false),
  GET_HANDLER: vi.fn(async () => new Response("ok", { status: 200 })),
  POST_HANDLER: vi.fn(async () => new Response("ok", { status: 200 })),
}))

vi.mock("@/lib/auth", () => ({
  isAuthConfigured: () => configured(),
  handlers: { GET: GET_HANDLER, POST: POST_HANDLER },
}))

import { GET, POST } from "./route"

// next-auth's handlers take only the request; the catch-all segment is parsed
// from the URL, so no route context is threaded through.
const req = () => new Request("http://localhost/api/auth/session") as never

beforeEach(() => {
  vi.clearAllMocks()
  configured.mockReturnValue(false)
})

describe("/api/auth/[...nextauth] — unconfigured", () => {
  it("answers 404 rather than 500 on GET", async () => {
    const res = await GET(req())

    expect(res.status).toBe(404)
    expect(GET_HANDLER).not.toHaveBeenCalled()
  })

  it("answers 404 rather than 500 on POST", async () => {
    const res = await POST(req())

    expect(res.status).toBe(404)
    expect(POST_HANDLER).not.toHaveBeenCalled()
  })

  it("is not cached, so configuring credentials takes effect immediately", async () => {
    const res = await GET(req())

    expect(res.headers.get("cache-control")).toBe("no-store")
  })
})

describe("/api/auth/[...nextauth] — configured", () => {
  it("delegates to next-auth once credentials exist", async () => {
    configured.mockReturnValue(true)

    const res = await GET(req())

    expect(res.status).toBe(200)
    expect(GET_HANDLER).toHaveBeenCalledOnce()
  })

  it("delegates POST too", async () => {
    configured.mockReturnValue(true)

    await POST(req())

    expect(POST_HANDLER).toHaveBeenCalledOnce()
  })
})
