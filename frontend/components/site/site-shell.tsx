import { SiteNavbar } from "@/components/site/site-navbar"
import { SiteFooter } from "@/components/site/site-footer"
import { AuthControl } from "@/components/site/auth-control"

interface SiteShellProps {
  children: React.ReactNode
  /** Omit the footer on app-like pages such as the docs reader. */
  withFooter?: boolean
}

/**
 * Shared chrome for the marketing surfaces: blueprint grid, scanline veil,
 * navbar and footer. Pages supply only their own sections.
 */
export function SiteShell({ children, withFooter = true }: SiteShellProps) {
  return (
    <div className="ca-grid relative min-h-screen bg-background text-foreground">
      <div
        aria-hidden="true"
        className="ca-scanlines pointer-events-none fixed inset-0 z-[100] opacity-50"
      />
      <SiteNavbar
        authControl={<AuthControl />}
        mobileAuthControl={<AuthControl compact />}
      />
      <main>{children}</main>
      {withFooter && <SiteFooter />}
    </div>
  )
}
