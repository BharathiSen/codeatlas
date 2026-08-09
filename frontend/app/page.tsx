import { SiteShell } from "@/components/site/site-shell"
import { Hero } from "@/components/site/hero"
import { HowItWorks } from "@/components/site/how-it-works"
import { ProductShowcase } from "@/components/site/product-showcase"
import { MorePages } from "@/components/site/more-pages"
import { TrustStrip } from "@/components/site/trust-strip"

export default function Home() {
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
