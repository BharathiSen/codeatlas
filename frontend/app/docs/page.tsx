import type { Metadata } from "next"
import { SiteShell } from "@/components/site/site-shell"
import { DOC_GROUPS, DOC_SECTIONS, type DocBlock } from "@/lib/docs-content"

export const metadata: Metadata = {
  title: "Documentation - CodeAtlas",
  description:
    "Install, configure and run CodeAtlas — the AI-powered Repository Intelligence Platform.",
}

function DocBlockView({ block }: { block: DocBlock }) {
  switch (block.kind) {
    case "h3":
      return (
        <h3 className="mb-3 mt-8 font-head text-[19px] font-bold text-foreground">{block.text}</h3>
      )
    case "code":
      return (
        <pre className="my-4 overflow-x-auto rounded-lg border border-border bg-card p-4 font-mono text-[13px] leading-relaxed text-foreground">
          <code>{block.lines?.join("\n")}</code>
        </pre>
      )
    case "list":
      return (
        <ul className="my-4 flex list-none flex-col gap-2 p-0">
          {block.lines?.map((line) => (
            <li key={line} className="relative pl-4 text-sm leading-relaxed text-muted-foreground">
              <span aria-hidden="true" className="absolute left-0 top-[10px] h-px w-2 bg-faint" />
              {line}
            </li>
          ))}
        </ul>
      )
    default:
      return <p className="mb-4 text-sm leading-[1.7] text-muted-foreground">{block.text}</p>
  }
}

export default function DocsPage() {
  return (
    <SiteShell withFooter={false}>
      <div className="mx-auto flex max-w-[1280px] flex-col lg:flex-row">
        {/* Section index. Anchor links keep this a server component. */}
        <aside className="flex-none border-b border-border px-6 py-8 lg:sticky lg:top-[57px] lg:h-[calc(100vh-57px)] lg:w-[240px] lg:overflow-auto lg:border-b-0 lg:border-r">
          <nav aria-label="Documentation">
            {DOC_GROUPS.map((group) => (
              <div key={group} className="mb-6">
                <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.06em] text-faint">
                  {group}
                </div>
                <ul className="flex list-none flex-col gap-0.5 p-0">
                  {DOC_SECTIONS.filter((s) => s.group === group).map((section) => (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        className="block rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                      >
                        {section.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 px-6 py-12 lg:px-14">
          <div className="max-w-[760px]">
            <div className="mb-3 font-mono text-xs uppercase tracking-[0.08em] text-primary">
              Documentation
            </div>
            <h1 className="m-0 mb-4 font-head text-[clamp(28px,5vw,36px)] font-extrabold tracking-[-0.03em] text-foreground">
              Running CodeAtlas
            </h1>
            <p className="m-0 mb-10 text-[15px] leading-relaxed text-muted-foreground">
              Everything needed to install, configure and operate the platform.
            </p>

            {DOC_SECTIONS.map((section) => (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-24 border-t border-border py-10 first:border-t-0 first:pt-0"
              >
                <h2 className="m-0 mb-4 font-head text-2xl font-bold tracking-[-0.02em] text-foreground">
                  {section.title}
                </h2>
                {section.blocks.map((block, i) => (
                  <DocBlockView key={i} block={block} />
                ))}
              </section>
            ))}
          </div>
        </main>
      </div>
    </SiteShell>
  )
}
