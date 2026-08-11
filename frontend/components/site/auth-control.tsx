import { Github, LogOut } from "lucide-react"
import { auth, isAuthConfigured, signIn, signOut } from "@/lib/auth"

/**
 * Sign-in / sign-out control.
 *
 * A server component: it reads the session directly and posts to server actions,
 * so no session provider or client-side fetch is needed, and the navbar renders
 * the correct state on the first paint rather than flickering from signed-out to
 * signed-in.
 *
 * Signing in is optional everywhere. It buys a private request budget instead of
 * the shared anonymous one — nothing in the product is gated behind it — so when
 * GitHub credentials are absent this renders nothing at all rather than offering
 * a button that can only fail.
 */
export async function AuthControl({ compact = false }: { compact?: boolean }) {
  if (!isAuthConfigured()) return null

  const session = await auth()

  const buttonClass = compact
    ? "flex w-full items-center justify-center gap-2 rounded-md border border-border px-4 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:border-primary/45 hover:text-foreground"
    : "flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:border-primary/45 hover:text-foreground"

  if (session?.user) {
    return (
      <form
        action={async () => {
          "use server"
          await signOut({ redirectTo: "/" })
        }}
        className={compact ? "w-full" : undefined}
      >
        <button type="submit" className={buttonClass}>
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="max-w-[12ch] truncate">
            {session.user.name ?? "Signed in"}
          </span>
          <span className="sr-only">— sign out</span>
        </button>
      </form>
    )
  }

  return (
    <form
      action={async () => {
        "use server"
        await signIn("github", { redirectTo: "/" })
      }}
      className={compact ? "w-full" : undefined}
    >
      <button type="submit" className={buttonClass}>
        <Github className="h-3.5 w-3.5" aria-hidden="true" />
        Sign in
      </button>
    </form>
  )
}
