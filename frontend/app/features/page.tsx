import type { Metadata } from "next"
import { SiteShell } from "@/components/site/site-shell"
import { CtaBand } from "@/components/site/cta-band"
import { FEATURE_GROUPS } from "@/lib/site-content"

export const metadata: Metadata = {
  title: "Features - CodeAtlas",
  description:
    "Built to understand repositories, not just files. Every CodeAtlas capability draws from the same indexed repository context.",
}

export default function FeaturesPage() {
  return (
    <SiteShell>
      <section className="mx-auto max-w-[760px] px-6 pb-14 pt-20 text-center lg:pt-24">
        <div className="mb-3.5 font-mono text-xs uppercase tracking-[0.08em] text-primary">
          Features
        </div>
        <h1 className="m-0 mb-4 font-head text-[clamp(32px,5.5vw,48px)] font-extrabold leading-[1.05] tracking-[-0.03em] text-foreground">
          Built to understand repositories, not just files.
        </h1>
        <p className="m-0 text-base leading-relaxed text-muted-foreground">
          Every capability below draws from the same indexed context — nothing operates on a
          single open file in isolation.
        </p>
      </section>

      {FEATURE_GROUPS.map((group) => (
        <section
          key={group.tag}
          className="mx-auto max-w-[1120px] border-t border-border px-6 py-14 lg:px-8"
        >
          <div className="grid grid-cols-1 gap-8 md:grid-cols-[280px_1fr] md:gap-12">
            <div>
              <div className="mb-2 font-mono text-xs text-primary">{group.tag}</div>
              <h2 className="m-0 mb-2.5 font-head text-[26px] font-semibold tracking-[-0.01em] text-foreground">
                {group.title}
              </h2>
              <p className="m-0 text-sm leading-relaxed text-muted-foreground">{group.desc}</p>
            </div>

            <ul className="grid list-none grid-cols-1 content-start gap-px overflow-hidden rounded-xl border border-border bg-border p-0 sm:grid-cols-2">
              {group.items.map((item) => (
                <li key={item.title} className="bg-background p-5">
                  <h3 className="m-0 mb-1.5 font-head text-[15px] font-semibold text-foreground">
                    {item.title}
                  </h3>
                  <p className="m-0 text-[13px] leading-relaxed text-muted-foreground">
                    {item.desc}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      <div className="border-t border-border pt-14">
        <CtaBand title="See it against your own repository." />
      </div>
    </SiteShell>
  )
}
