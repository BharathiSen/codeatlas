"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { NAV_LINKS } from "@/lib/site-content"
import { LogoMark } from "@/components/site/logo-mark"

/**
 * Sticky site header. Collapses to a disclosure menu below `md`.
 */
export function SiteNavbar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname?.startsWith(href)

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-[1280px] items-center gap-8 px-6 py-4 lg:px-10"
      >
        <Link href="/" className="mr-auto" aria-label="CodeAtlas home">
          <LogoMark />
        </Link>

        <ul className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={cn(
                  "text-sm transition-colors hover:text-foreground",
                  isActive(link.href) ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <Link
          href="/#map"
          className="hidden rounded-md bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 md:inline-block"
        >
          Map Repository
        </Link>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="site-nav-mobile"
          aria-label={open ? "Close menu" : "Open menu"}
          className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground md:hidden"
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </nav>

      {open && (
        <div id="site-nav-mobile" className="border-t border-border px-6 py-4 md:hidden">
          <ul className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={cn(
                    "block rounded-md px-2 py-2 text-sm transition-colors hover:bg-card hover:text-foreground",
                    isActive(link.href) ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/#map"
            onClick={() => setOpen(false)}
            className="mt-3 block rounded-md bg-primary px-4 py-2.5 text-center text-[13px] font-semibold text-primary-foreground"
          >
            Map Repository
          </Link>
        </div>
      )}
    </header>
  )
}
