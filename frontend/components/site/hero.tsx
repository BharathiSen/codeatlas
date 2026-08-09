import { CommandBar } from "@/components/site/command-bar"

export function Hero() {
  return (
    <section className="mx-auto flex max-w-[900px] flex-col items-center px-6 pb-20 pt-24 text-center sm:pt-28 lg:pt-[120px]">
      <div className="mb-7 inline-flex items-center gap-2 rounded-sm border border-dashed border-white/20 px-3 py-1.5 font-mono text-xs text-muted-foreground">
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 flex-none rounded-full bg-primary animate-ca-pulse"
        />
        Whole-repository intelligence, grounded in your source
      </div>

      <h1 className="m-0 mb-5 font-head text-[clamp(40px,6.4vw,74px)] font-extrabold leading-[1.02] tracking-[-0.035em] text-foreground">
        Every codebase
        <br />
        has a <span className="text-primary">map.</span>
        <span
          aria-hidden="true"
          className="inline-block w-[0.5ch] text-primary animate-ca-blink"
        >
          _
        </span>
      </h1>

      <p className="m-0 mb-10 max-w-[620px] text-base leading-relaxed text-muted-foreground sm:text-lg">
        CodeAtlas understands entire repositories instead of isolated files, helping developers
        navigate architecture, dependencies, APIs, and implementation details with AI.
      </p>

      <CommandBar />
    </section>
  )
}
