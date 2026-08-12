import { after } from "next/server"
import { SiteShell } from "@/components/site/site-shell"
import { Hero } from "@/components/site/hero"
import { HowItWorks } from "@/components/site/how-it-works"
import { ProductShowcase } from "@/components/site/product-showcase"
import { MorePages } from "@/components/site/more-pages"
import { TrustStrip } from "@/components/site/trust-strip"
import { logger } from "@/lib/logger"

/**
 * Nudge the ingestion service awake while the visitor reads the page.
 *
 * On a free deployment the backend sleeps after inactivity and takes a while to
 * bind its port; the first repository someone maps otherwise pays that entire
 * cold start, and used to surface as a bare failure. Landing on the page is the
 * earliest honest signal that a request is coming, and it buys the seconds
 * between arriving and typing a repository name.
 *
 * Deliberately modest:
 *   - `after()` runs it once the response is sent, so it can never delay render
 *   - one request per page load, not a poll — the backend is allowed to sleep
 *   - `/ping` needs no service token, so nothing secret is involved and no
 *     credential reaches the browser (this runs on the server regardless)
 *   - every failure is swallowed; a cold or missing backend must not affect the
 *     landing page, which works fine without it
 */
function warmIngestionService(): void {
  const base = process.env.GITINGEST_API_URL
  if (!base) return

  after(async () => {
    try {
      await fetch(`${base}/ping`, {
        method: "HEAD",
        signal: AbortSignal.timeout(5_000),
        cache: "no-store",
      })
    } catch {
      // Expected while the service is waking. Nothing to do and nothing to say
      // to the visitor — the mapping request will report the real state.
      logger.debug("Warm-up ping did not complete", { prefix: "Warmup" })
    }
  })
}

export default function Home() {
  warmIngestionService()

  return (
    <SiteShell>
      <Hero />
      <HowItWorks />
      <ProductShowcase />
      <MorePages />
      <TrustStrip />
    </SiteShell>
  )
}
