import Link from "next/link"

interface CtaBandProps {
  title: string
  description?: string
}

/** Closing call-to-action panel shared by the landing and features pages. */
export function CtaBand({ title, description }: CtaBandProps) {
  return (
    <section className="mx-auto max-w-[1120px] px-6 pb-24 lg:px-8">
      <div className="rounded-2xl border border-white/20 bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.08),transparent_60%)] px-8 py-14 text-center sm:px-10 sm:py-16">
        <h2 className="m-0 mb-3.5 font-head text-[clamp(24px,4vw,32px)] font-bold tracking-[-0.02em] text-foreground">
          {title}
        </h2>
        {description && (
          <p className="m-0 mb-7 text-[15px] text-muted-foreground">{description}</p>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/#map"
            className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Map Repository
          </Link>
          <Link
            href="/docs"
            className="rounded-lg border border-white/20 px-6 py-3 text-sm text-foreground transition-colors hover:border-primary/60"
          >
            Read the docs
          </Link>
        </div>
      </div>
    </section>
  )
}
