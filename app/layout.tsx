import type React from "react"
import type { Metadata } from "next"
import { Inter, JetBrains_Mono, Roboto_Mono, Roboto } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Analytics } from "@vercel/analytics/react"
import { SpeedInsights } from "@vercel/speed-insights/next"
import Script from "next/script" 

const roboto = Roboto({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "700", "900"],
})

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "700"],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-code",
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
      <head>
        {/* Optional analytics — set NEXT_PUBLIC_RYBBIT_SITE_ID to enable for your own CodeAtlas deployment */}
        {process.env.NEXT_PUBLIC_RYBBIT_SITE_ID && (
          <Script
            src="https://app.rybbit.io/api/script.js"
            data-site-id={process.env.NEXT_PUBLIC_RYBBIT_SITE_ID}
            strategy="afterInteractive"
          />
        )}
      </head>
      <body className={`${roboto.variable} ${robotoMono.variable} ${jetbrainsMono.variable} font-sans`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          {children}
          <Analytics />
          <SpeedInsights />
        </ThemeProvider>
      </body>
    </html>
  )
}