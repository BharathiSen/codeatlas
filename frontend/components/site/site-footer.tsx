import Link from "next/link"
import { FOOTER_LINKS } from "@/lib/site-content"

export function SiteFooter() {
  return (
    <footer className="border-t border-border px-6 py-12 lg:px-10">
      <div className="mx-auto flex max-w-[1120px] flex-wrap justify-between gap-8">
        <div className="font-head text-[15px] font-bold text-foreground">CodeAtlas</div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-7">
            {FOOTER_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="mx-auto mt-8 max-w-[1120px] font-mono text-[11px] text-faint">
        © 2026 CodeAtlas. Open source under MIT.
      </div>
    </footer>
  )
}
