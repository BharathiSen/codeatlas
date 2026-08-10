import type React from "react"
import type { Metadata } from "next"
import { Bricolage_Grotesque, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Analytics } from "@vercel/analytics/react"
import { SpeedInsights } from "@vercel/speed-insights/next"
import Script from "next/script"

// Body copy and UI.
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600"],
  display: "swap",
})

// Display face for headings and the wordmark.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-head",
  weight: ["400", "600", "700", "800"],
  display: "swap",
})

// Every code path, identifier, metric and label.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  display: "swap",
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