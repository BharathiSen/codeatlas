import { Code2, Cpu, Lock, Server, ShieldCheck } from "lucide-react"
import { TRUST_ITEMS } from "@/lib/site-content"

const ICONS: Record<string, typeof Lock> = {
  lock: Lock,
  server: Server,
  cpu: Cpu,
  shield: ShieldCheck,
  code: Code2,
}

/** Assurance strip that closes the page, above the footer. */
export function TrustStrip() {
  return (
    <section className="border-t border-border bg-card/30">
      <ul className="mx-auto grid max-w-[1280px] list-none grid-cols-1 gap-6 px-6 py-8 p-0 sm:grid-cols-2 lg:grid-cols-5 lg:px-8">
        {TRUST_ITEMS.map((item) => {
          const Icon = ICONS[item.icon] ?? Lock
          return (
            <li key={item.title} className="flex items-start gap-3">
              <div className="grid h-8 w-8 flex-none place-items-center rounded-lg border border-primary/25 bg-primary/[0.08]">
                <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-foreground">{item.title}</div>
                <div className="text-xs text-muted-foreground">{item.note}</div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
