'use client'

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ArrowRight,
  Boxes,
  Compass,
  FileCode2,
  GitBranch,
  Layers,
  Network,
  Search,
  ShieldCheck,
} from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { EnhancedLoading } from "@/components/enhanced-loading"
import { AnimatedText } from "@/components/animated-text"

const EXAMPLE_REPOS = ["vercel/next.js", "honojs/hono", "colinhacks/zod"]

const PIPELINE = [
  {
    step: "01",
    title: "Ingest",
    icon: GitBranch,
    body: "The repository is flattened in a single pass — every file, the full tree, the documentation — into one coherent context.",
  },
  {
    step: "02",
    title: "Index",
    icon: Layers,
    body: "That context is cached and kept warm, so the map is built once and every question after it is answered against the same ground truth.",
  },
  {
    step: "03",
    title: "Interrogate",
    icon: Search,
    body: "Ask in plain language. Answers cite real paths and draw real diagrams, because they are derived from the source rather than recalled.",
  },
]

export default function Home() {
  const router = useRouter()
  const [repoUrl, setRepoUrl] = useState("")
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [loadingText, setLoadingText] = useState("Analyzing Repository...") // New state for loading text
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus the input field when component mounts
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  const handleAnalyze = async () => { // Make handleAnalyze async
    // Extract username and repo from the URL
    const urlPattern = /(?:github\.com\/)(([-\w.]+)\/([-\w.]+))/
    const match = repoUrl.match(urlPattern)

    let username: string | null = null;
    let repo: string | null = null;

    if (match) {
      [, , username, repo] = match
    } else {
      // If URL doesn't match pattern, check if it contains any text and try to extract username/repo
      const simplifiedPattern = /(([-\w.]+)\/([-\w.]+))/
      const simplifiedMatch = repoUrl.match(simplifiedPattern)

      if (simplifiedMatch) {
        [, , username, repo] = simplifiedMatch
      } else if (repoUrl.trim() !== '') {
        // If no pattern matches but there is text, alert the user
        alert('Please enter a valid GitHub repository URL or username/repository format')
        return;
      } else {
        // If empty, alert the user
        alert('Please enter a GitHub repository URL')
        return;
      }
    }

    if (username && repo) {
      setIsAnalyzing(true)
      setLoadingText("Fetching Repository Data...")

      try {
        // First, trigger GitIngest analysis
        setLoadingText("Analyzing repository with GitIngest...");
        const gitIngestResponse = await fetch('/api/collect-repo-data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username, repo, force: true }), // force: true to ensure fresh fetch
        });

        const gitIngestResult = await gitIngestResponse.json();

        if (!gitIngestResponse.ok) {
          throw new Error(gitIngestResult.error || 'Failed to analyze repository with GitIngest');
        }

        setLoadingText("Repository analyzed successfully!");

        // Add a small delay to show success message before navigating
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Navigate to the repository page
        router.push(`/${username}/${repo}`);
      } catch (error) {
        console.error('Failed to analyze repository:', error);
        alert(error instanceof Error ? error.message : 'Failed to analyze repository');
        setIsAnalyzing(false);
        setLoadingText("Analyzing Repository..."); // Reset loading text
      }
    }
    // Log for debugging
    console.log('Analyze button clicked', { repoUrl })
  }

  // Handle Enter key press in the input field
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault() // Prevent default form submission
      console.log('Enter key pressed')
      handleAnalyze()
    }
  }

  return (
    <div className="flex flex-col bg-background">
      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <main className="relative min-h-screen flex flex-col items-center justify-center px-6 py-24 overflow-hidden">
        {/* Cartographic backdrop: graticule + contour rings, both masked outward */}
        <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
          <div className="absolute inset-0 atlas-graticule atlas-mask opacity-70" />
          <div className="absolute inset-0 atlas-contours atlas-mask animate-contour-drift" />
          <div className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2">
            <span className="atlas-marker absolute inset-0 m-auto h-3 w-3 rounded-full bg-primary/40 animate-survey-ping" />
            <span className="relative block h-1.5 w-1.5 rounded-full bg-primary/70" />
          </div>
        </div>

        <div className="relative z-10 w-full max-w-4xl">
          {isAnalyzing ? (
            <div className="flex items-center justify-center min-h-[320px]">
              <EnhancedLoading loadingText={loadingText} />
            </div>
          ) : (
            <div className="flex flex-col items-center text-center">
              {/* Eyebrow */}
              <div className="animate-fade-in inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3.5 py-1.5 backdrop-blur-sm">
                <Compass className="h-3.5 w-3.5 text-primary" />
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Repository Intelligence Platform
                </span>
              </div>

              {/* Headline */}
              <h1 className="mt-8 text-5xl sm:text-6xl lg:text-7xl font-bold tracking-[-0.035em] leading-[1.05] text-foreground">
                Every codebase
                <br className="hidden sm:block" />{" "}
                <AnimatedText
                  text="has a map."
                  className="bg-gradient-to-r from-emerald-400 via-teal-400 to-sky-400 bg-clip-text text-transparent"
                  cursorClassName="h-[0.8em] bg-teal-400"
                  speed={70}
                  delay={350}
                  showCursor={true}
                />
              </h1>

              <p
                className="mt-6 max-w-xl text-base sm:text-lg leading-relaxed text-muted-foreground animate-fade-in-up"
                style={{ animationDelay: '0.9s' }}
              >
                CodeAtlas reads an entire repository — not one file at a time — and answers
                architecture questions from the source itself. Paste a repo, get its terrain.
              </p>

              {/* Command bar: input and action share one surface */}
              <div
                className="mt-10 w-full max-w-2xl animate-fade-in-up"
                style={{ animationDelay: '1.1s' }}
              >
                <div className="group flex flex-col sm:flex-row items-stretch gap-2 rounded-xl border border-border bg-card/80 p-2 shadow-2xl shadow-black/20 backdrop-blur-sm transition-colors focus-within:border-primary/60">
                  <div className="flex flex-1 items-center gap-2.5 px-3">
                    <span className="font-mono text-sm text-primary select-none">▸</span>
                    <Input
                      placeholder="github.com/owner/repository"
                      className="h-11 flex-1 border-0 bg-transparent px-0 font-mono text-sm shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0"
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      onKeyDown={handleKeyPress}
                      ref={inputRef}
                      autoFocus
                      aria-label="GitHub repository URL"
                      onPaste={(e) => {
                        e.stopPropagation()
                        const pastedText = e.clipboardData.getData('text')
                      }}
                    />
                  </div>
                  <Button
                    className="h-11 shrink-0 gap-2 bg-primary px-5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90"
                    onClick={handleAnalyze}
                    type="button"
                    aria-label="Map Repository"
                  >
                    Map repository
                    <ArrowRight size={15} />
                  </Button>
                </div>

                {/* Example chips fill the bar rather than just naming a URL */}
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs">
                  <span className="font-mono uppercase tracking-[0.14em] text-muted-foreground/70">
                    Try
                  </span>
                  {EXAMPLE_REPOS.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => {
                        setRepoUrl(example)
                        inputRef.current?.focus()
                      }}
                      className="rounded-md border border-border bg-card/50 px-2.5 py-1 font-mono text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Pipeline ───────────────────────────────────────────────────────── */}
      <section className="relative px-6 py-24 border-t border-border">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center gap-4">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
              How it works
            </span>
            <div className="atlas-rule h-px flex-1" />
          </div>

          <div className="mt-14 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
            {PIPELINE.map(({ step, title, icon: Icon, body }) => (
              <div
                key={step}
                className="group relative bg-background p-8 transition-colors hover:bg-card"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-4xl font-bold tracking-tighter text-border transition-colors group-hover:text-primary/40">
                    {step}
                  </span>
                  <Icon className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
                </div>
                <h3 className="mt-6 text-lg font-semibold text-foreground">{title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Capabilities ───────────────────────────────────────────────────── */}
      <section className="px-6 pb-28">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center gap-4">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
              Inside the platform
            </span>
            <div className="atlas-rule h-px flex-1" />
          </div>

          {/* Asymmetric grid — the lead capability gets the room it deserves */}
          <div className="mt-14 grid gap-4 md:grid-cols-3">
            <div className="relative overflow-hidden rounded-xl border border-border bg-card p-8 md:col-span-2 md:row-span-2">
              <div className="absolute inset-0 atlas-contours opacity-[0.35]" aria-hidden="true" />
              <div className="relative">
                <Network className="h-6 w-6 text-primary" />
                <h3 className="mt-5 text-xl font-semibold text-foreground">
                  Answers grounded in the whole repository
                </h3>
                <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
                  The assistant sees the full tree and the full source, so questions about how
                  modules connect get answered with the structure that is actually there. Architecture
                  questions come back with mermaid diagrams; specific questions come back with file
                  paths you can open.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {["Architecture", "Dependencies", "Code paths", "Diagrams"].map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md border border-border bg-background/60 px-2.5 py-1 font-mono text-[11px] text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <FileCode2 className="h-5 w-5 text-primary" />
              <h4 className="mt-4 font-semibold text-foreground">Reads more than source</h4>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Code, Jupyter notebooks and PDFs all render in place, in one explorer.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <Boxes className="h-5 w-5 text-primary" />
              <h4 className="mt-4 font-semibold text-foreground">Warm by default</h4>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                A repository is ingested once and cached, so the second visit opens immediately.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 md:col-span-3">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <h4 className="font-semibold text-foreground">Bounded, visible usage</h4>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      A daily request budget is shown in the workspace at all times, with a fallback
                      key behind it — so you never discover a limit by hitting a wall.
                    </p>
                  </div>
                </div>
                <span className="shrink-0 rounded-md border border-border bg-background/60 px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                  quota visible in-app
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
