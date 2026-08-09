import { FEATURES, FILE_TYPES } from "@/lib/site-content"
import { SectionHeading } from "@/components/site/section-heading"

/**
 * The capability grid plus the three supporting cards beneath it. The grid uses
 * a 1px gap over a border-coloured background to draw hairline dividers.
 */
export function FeatureCards() {
  return (
    <section className="mx-auto max-w-[1120px] px-6 py-20 lg:px-8 lg:py-24">
      <SectionHeading
        eyebrow="Capabilities"
        title="Everything grounded in your repository"
        className="mb-11"
      />

      <ul className="grid list-none grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border p-0 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <li key={feature.tag} className="flex flex-col gap-2 bg-background p-6">
            <div className="font-mono text-xs text-primary">{feature.tag}</div>
            <h3 className="m-0 font-head text-base font-bold text-foreground">{feature.title}</h3>
            <p className="m-0 text-[13px] leading-relaxed text-muted-foreground">{feature.desc}</p>
          </li>
        ))}
      </ul>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-border p-7">
          <h3 className="m-0 mb-2 font-head text-[17px] font-bold text-foreground">
            Reads more than source
          </h3>
          <p className="m-0 mb-4.5 text-[13px] leading-relaxed text-muted-foreground">
            Supports the full shape of a real repository, not just .py and .ts files.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {FILE_TYPES.map((type) => (
              <span
                key={type}
                className="rounded-md border border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground"
              >
                {type}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border p-7">
          <h3 className="m-0 mb-2 font-head text-[17px] font-bold text-foreground">
            Warm by default
          </h3>
          <p className="m-0 mb-4.5 text-[13px] leading-relaxed text-muted-foreground">
            Repositories stay cached after the first ingestion — no re-cloning per question.
          </p>
          <div className="mt-4 flex items-center gap-2 font-mono text-xs text-primary">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
            cache warm · 6h TTL
          </div>
        </div>

        <div className="rounded-xl border border-border p-7">
          <h3 className="m-0 mb-2 font-head text-[17px] font-bold text-foreground">
            Bounded usage
          </h3>
          <p className="m-0 mb-4.5 text-[13px] leading-relaxed text-muted-foreground">
            A daily request budget is shown in the workspace at all times, with a fallback key
            behind it.
          </p>
          <div className="mt-4 flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent-3" />
            quota visible in-app
          </div>
        </div>
      </div>
    </section>
  )
}
