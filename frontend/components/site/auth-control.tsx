import { Github, LogOut } from "lucide-react"
import { auth, signIn, signOut } from "@/lib/auth"

/**
 * Sign-in / sign-out control.
 *
 * A server component: it reads the session directly and posts to server actions,
 * so no session provider or client-side fetch is needed, and the navbar renders
 * the correct state on the first paint rather than flickering from signed-out to
 * signed-in.
 *
 * Signing in is optional everywhere — it buys a private request budget instead of
 * the shared anonymous one, and nothing in the product is gated behind it.
 *
 * This used to return `null` unless `isAuthConfigured()` saw both GitHub
 * credentials, so an unconfigured deployment would not offer a button that could
 * only fail. That gate was removed: its failure mode is that the control vanishes
 * with no signal anywhere — no error, no log, no empty state — which is
 * indistinguishable from the feature never having been built, and it cost a long
 * production debugging session to find. A button that errors when clicked is
 * worse UX than one that works; a button that silently does not exist is worse
 * than both, because nobody can tell it is missing on purpose.
 *
 * The equivalent check still guards `/api/auth/*` in that route handler, which is
 * where it actually matters — an unconfigured deployment answers 404 there rather
 * than 500.
 */
export async function AuthControl({ compact = false }: { compact?: boolean }) {
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
        <span className="whitespace-nowrap">Sign in with GitHub</span>
      </button>
    </form>
  )
}
