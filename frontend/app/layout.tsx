import type React from "react"
import type { Metadata } from "next"
import localFont from "next/font/local"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Analytics } from "@vercel/analytics/react"
import { SpeedInsights } from "@vercel/speed-insights/next"
import Script from "next/script"

/*
 * Fonts are served from this repository, not fetched from Google at build time.
 *
 * `next/font/google` downloads each face during `next build`, which makes the
 * build depend on a third party being reachable — CI failed with
 * `NextFontError: Failed to fetch 'IBM Plex Sans' from Google Fonts` on a runner
 * network blip, and a build that fails for reasons unrelated to the code is a
 * build nobody trusts. The files below are the identical latin woff2 subsets
 * Next would have fetched (D-43).
 *
 * It also removes a third-party request from the critical path for every
 * visitor: no DNS, TLS and round trip to fonts.gstatic.com before text renders.
 */

// Body copy and UI.
const ibmPlexSans = localFont({
  variable: "--font-sans",
  display: "swap",
  src: [
    { path: "./fonts/IBMPlexSans-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexSans-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/IBMPlexSans-600.woff2", weight: "600", style: "normal" },
  ],
})

// Display face for headings and the wordmark.
const bricolage = localFont({
  variable: "--font-head",
  display: "swap",
  src: [
    { path: "./fonts/BricolageGrotesque-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/BricolageGrotesque-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/BricolageGrotesque-700.woff2", weight: "700", style: "normal" },
    { path: "./fonts/BricolageGrotesque-800.woff2", weight: "800", style: "normal" },
  ],
})

// Every code path, identifier, metric and label.
const jetbrainsMono = localFont({
  variable: "--font-mono",
  display: "swap",
  src: [
    { path: "./fonts/JetBrainsMono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/JetBrainsMono-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/JetBrainsMono-600.woff2", weight: "600", style: "normal" },
  ],
})

export const metadata: Metadata = {
  title: "CodeAtlas - AI-Powered Repository Intelligence Platform",
  description:
    "CodeAtlas turns any repository into navigable intelligence — architecture, dependencies and code paths explained by AI.",
  applicationName: "CodeAtlas",
  generator: "Next.js",
  keywords: ["CodeAtlas", "repository intelligence", "code understanding", "AI code analysis", "codebase explorer"],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "CodeAtlas - AI-Powered Repository Intelligence Platform",
    description:
      "CodeAtlas turns any repository into navigable intelligence — architecture, dependencies and code paths explained by AI.",
    siteName: "CodeAtlas",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CodeAtlas - AI-Powered Repository Intelligence Platform",
    description:
      "CodeAtlas turns any repository into navigable intelligence — architecture, dependencies and code paths explained by AI.",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      {/*
       * No hand-written <head>: the App Router builds it from `metadata`, and a
       * manual one introduces whitespace text nodes that fail hydration and take
       * the injected stylesheet down with them. next/script places itself.
       */}
      <body className={`${ibmPlexSans.variable} ${bricolage.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          {children}
          <Analytics />
          <SpeedInsights />
        </ThemeProvider>

        {/* Optional analytics — set NEXT_PUBLIC_RYBBIT_SITE_ID to enable for your own CodeAtlas deployment */}
        {process.env.NEXT_PUBLIC_RYBBIT_SITE_ID && (
          <Script
            src="https://app.rybbit.io/api/script.js"
            data-site-id={process.env.NEXT_PUBLIC_RYBBIT_SITE_ID}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  )
}