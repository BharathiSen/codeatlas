import type { NextRequest } from "next/server"
import { handlers, isAuthConfigured } from "@/lib/auth"

/**
 * OAuth endpoints.
 *
 * Sign-in is optional, so this surface only exists when GitHub credentials are
 * present. Unconfigured, every next-auth action throws on a missing client id
 * and answers 500; a 404 says the same thing honestly and keeps an unconfigured
 * deployment free of endpoints that can only fail.
 */
const notConfigured = () =>
  new Response(null, { status: 404, headers: { "cache-control": "no-store" } })

export async function GET(req: NextRequest) {
  if (!isAuthConfigured()) return notConfigured()
  return handlers.GET(req)
}

export async function POST(req: NextRequest) {
  if (!isAuthConfigured()) return notConfigured()
  return handlers.POST(req)
}
