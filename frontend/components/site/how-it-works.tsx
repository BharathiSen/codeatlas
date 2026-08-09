import { PIPELINE_STEPS } from "@/lib/site-content"
import { SectionHeading } from "@/components/site/section-heading"

/** The three-stage ingestion pipeline, joined by a gradient rail. */
export function HowItWorks() {
  return (
    <section className="mx-auto max-w-[1120px] px-6 py-20 lg:px-8 lg:py-24">
      <div className="mb-14 flex flex-wrap items-baseline justify-between gap-3">
        <SectionHeading eyebrow="Pipeline" title="How CodeAtlas works" />
        <p className="m-0 max-w-[340px] text-sm text-muted-foreground">
          Three stages, one continuous process — from raw source to grounded answers.
        </p>
      </div>

      <ol className="relative grid list-none grid-cols-1 gap-10 p-0 md:grid-cols-3 md:gap-0">
        {/* Rail sits behind the numbered tiles, desktop only. */}
        <div
          aria-hidden="true"
          className="absolute left-[8%] right-[8%] top-[23px] hidden h-px bg-gradient-to-r from-primary via-accent-2 to-accent-3 opacity-35 md:block"
        />
        {PIPELINE_STEPS.map((step) => (
          <li key={step.num} className="relative md:px-6">
            <div className="relative z-[1] mb-6 grid h-[46px] w-[46px] place-items-center rounded-[10px] border border-white/20 bg-card font-mono text-sm font-semibold text-primary">
              {step.num}
            </div>
            <h3 className="m-0 mb-2.5 font-head text-[19px] font-bold text-foreground">
              {step.title}
            </h3>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {step.items.map((line) => (
                <li
                  key={line}
                  className="relative pl-3.5 text-sm leading-relaxed text-muted-foreground"
                >
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-[9px] h-px w-[5px] bg-faint"
                  />
                  {line}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  )
}
