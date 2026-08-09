"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { Github, Menu, Star, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { NAV_LINKS } from "@/lib/site-content"
import { LogoMark } from "@/components/site/logo-mark"
import { useGithubStars } from "@/hooks/useGithubStars"

const REPO_OWNER = process.env.NEXT_PUBLIC_CODEATLAS_REPO_OWNER || ""
const REPO_NAME = process.env.NEXT_PUBLIC_CODEATLAS_REPO_NAME || ""

export function SiteNavbar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const { stars, error: starsError } = useGithubStars(REPO_OWNER, REPO_NAME)

  const isActive = (href: string) => {
    const [path] = href.split("#")
    if (!path || path === "/") return pathname === "/"
    return pathname?.startsWith(path)
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-[1280px] items-center gap-8 px-6 py-3.5 lg:px-8"
      >
        <Link href="/" className="mr-auto lg:mr-8" aria-label="CodeAtlas home">
          <LogoMark />
        </Link>

        <ul className="mr-auto hidden items-center gap-7 md:flex">
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

        <div className="hidden items-center gap-3 md:flex">
          {stars !== null && !starsError && (
            <a
              href={`https://github.com/${REPO_OWNER}/${REPO_NAME}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:border-primary/45 hover:text-foreground"
            >
              <Github className="h-3.5 w-3.5" aria-hidden="true" />
              <Star className="h-3 w-3 fill-current" aria-hidden="true" />
              <span>{stars >= 1000 ? `${(stars / 1000).toFixed(1)}k` : stars}</span>
              <span className="sr-only">stars on GitHub</span>
            </a>
          )}

          <Link
            href="/docs"
            className="rounded-md border border-border px-3.5 py-1.5 text-[13px] text-foreground transition-colors hover:border-primary/45"
          >
            Sign in
          </Link>

          <Link
            href="/#map"
            className="ca-btn-gradient rounded-md px-4 py-2 text-[13px] font-semibold"
          >
            Get started
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="site-nav-mobile"
          aria-label={open ? "Close menu" : "Open menu"}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground md:hidden"
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
                  className="block rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/#map"
            onClick={() => setOpen(false)}
            className="ca-btn-gradient mt-3 block rounded-md px-4 py-2.5 text-center text-[13px] font-semibold"
          >
            Get started
          </Link>
        </div>
      )}
    </header>
  )
}
