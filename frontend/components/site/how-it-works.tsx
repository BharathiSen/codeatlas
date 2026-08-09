import { Download, Database, MessageSquare } from "lucide-react"
import { PIPELINE_STEPS } from "@/lib/site-content"

const STEP_ICONS = [Download, Database, MessageSquare]

/**
 * The three-stage pipeline, presented as one bordered card with vertical
 * dividers between stages.
 */
export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-[1280px] scroll-mt-20 px-6 pb-20 lg:px-8">
      <ol className="grid list-none grid-cols-1 gap-0 rounded-2xl border border-border bg-card/40 p-0 md:grid-cols-3">
        {PIPELINE_STEPS.map((step, i) => {
          const Icon = STEP_ICONS[i]
          return (
            <li
              key={step.num}
              className="flex gap-5 border-b border-border p-7 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 lg:p-8"
            >
              <div className="flex-none">
                <div className="grid h-11 w-11 place-items-center rounded-xl border border-primary/25 bg-primary/[0.08]">
                  <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                </div>
              </div>

              <div className="min-w-0">
                <div className="mb-2 inline-block rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {step.num}
                </div>
                <h3 className="m-0 mb-2 font-head text-lg font-bold text-foreground">
                  {step.title}
                </h3>
                <p className="m-0 text-sm leading-relaxed text-muted-foreground">
                  {step.blurb}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
