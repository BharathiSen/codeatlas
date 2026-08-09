import { CommandBar } from "@/components/site/command-bar"
import { ContourArt } from "@/components/site/contour-art"

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Artwork sits behind the copy on small screens, beside it on large. */}
      <ContourArt className="pointer-events-none absolute -right-24 top-0 h-[520px] w-[620px] opacity-40 lg:right-0 lg:opacity-100" />

      <div className="relative mx-auto max-w-[1280px] px-6 pb-16 pt-16 lg:px-8 lg:pb-24 lg:pt-24">
        <div className="max-w-[620px]">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/[0.08] px-3 py-1.5">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 flex-none rounded-full bg-primary animate-ca-pulse"
            />
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-primary">
              AI Repository Intelligence Platform
            </span>
          </div>

          <h1 className="m-0 mb-5 font-head text-[clamp(40px,7vw,68px)] font-extrabold leading-[1.02] tracking-[-0.035em] text-foreground">
            Every codebase
            <br />
            <span className="bg-gradient-to-r from-[#a78bfa] via-[#8b5cf6] to-[#7c3aed] bg-clip-text text-transparent">
              has a map.
            </span>
          </h1>

          <p className="m-0 mb-9 max-w-[520px] text-base leading-relaxed text-muted-foreground">
            CodeAtlas reads an entire repository — not one file at a time — and answers
            architecture questions from the source itself.
          </p>

          <CommandBar />
        </div>
      </div>
    </section>
  )
}
