import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"
import { getClientIP } from "./rate-limiter"

/**
 * GitHub sign-in.
 *
 * Identity exists here for one reason: to give the quota a subject. Anonymous
 * callers share an IP-derived bucket, which is coarse — shared NATs collide, and
 * behind an untrusted proxy every caller lands in the same bucket by design.
 * A signed-in user gets their own budget, which is both fairer and enforceable.
 *
 * Sessions are JWT-backed rather than database-backed: there is no database yet,
 * and a signed cookie carries everything the quota needs (a stable subject id).
 * When persistence lands, swap the strategy — the rest of the app only ever
 * asks for `quotaSubject`.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      // Read-only: CodeAtlas never writes to a repository, so it asks for
      // nothing beyond the public profile GitHub grants by default.
      authorization: { params: { scope: "read:user" } },
    }),
  ],

  session: { strategy: "jwt" },

  callbacks: {
    async jwt({ token, profile }) {
      // Persist the GitHub numeric id: it is stable across username changes,
      // which a login is not.
      if (profile?.id) token.githubId = String(profile.id)
      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.githubId as string) ?? token.sub ?? ""
      }
      return session
    },
  },

  pages: {
    // No custom sign-in page; GitHub's own screen is the whole flow.
  },
})

/** Quota bucket for a signed-in user. Namespaced so it cannot collide with an IP. */
export function userQuotaSubject(userId: string): string {
  return `user:${userId}`
}

/** Quota bucket for an anonymous caller. */
export function ipQuotaSubject(ip: string): string {
  return `ip:${ip}`
}

/**
 * Resolve the quota subject for a request: the signed-in user if there is one,
 * otherwise the caller's address.
 *
 * Every paid route calls this, so the bucket is derived identically everywhere —
 * the quickest way to leak free requests is two routes disagreeing about who the
 * caller is.
 */
export async function getQuotaSubject(req: Request): Promise<string> {
  try {
    const session = await auth()
    if (session?.user?.id) return userQuotaSubject(session.user.id)
  } catch {
    // A misconfigured or unreachable auth provider must not open the quota;
    // fall through to the anonymous bucket rather than to no bucket.
  }
  return ipQuotaSubject(getClientIP(req))
}
