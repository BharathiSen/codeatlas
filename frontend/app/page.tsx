import { SiteShell } from "@/components/site/site-shell"
import { Hero } from "@/components/site/hero"
import { HowItWorks } from "@/components/site/how-it-works"
import { ProductShowcase } from "@/components/site/product-showcase"
import { ComparisonTable } from "@/components/site/comparison-table"
import { FeatureCards } from "@/components/site/feature-cards"
import { CtaBand } from "@/components/site/cta-band"

export default function Home() {
  return (
    <SiteShell>
      <Hero />
      <HowItWorks />

      <div
        aria-hidden="true"
        className="mx-auto max-w-[1120px] border-t border-dashed border-border"
      />

      <ProductShowcase />
      <ComparisonTable />
      <FeatureCards />
      <CtaBand
        title="Give your team a map."
        description="Point CodeAtlas at any repository and start asking real architecture questions in minutes."
      />
    </SiteShell>
  )
}
