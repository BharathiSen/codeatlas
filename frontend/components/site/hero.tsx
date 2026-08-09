import { CommandBar } from "@/components/site/command-bar"

export function Hero() {
  return (
    <section className="mx-auto max-w-[900px] px-6 pb-16 pt-20 text-center lg:px-8 lg:pb-24 lg:pt-28">
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

      <p className="mx-auto m-0 mb-9 max-w-[560px] text-base leading-relaxed text-muted-foreground">
        CodeAtlas reads an entire repository — not one file at a time — and answers architecture
        questions from the source itself.
      </p>

      <CommandBar />
    </section>
  )
}
