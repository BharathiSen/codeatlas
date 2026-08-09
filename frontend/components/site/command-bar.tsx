"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { EnhancedLoading } from "@/components/enhanced-loading"
import { RepoChips } from "@/components/site/repo-chips"

/** Accepts a full GitHub URL or a bare `owner/repo` pair. */
function parseRepoInput(value: string): { username: string; repo: string } | null {
  const urlMatch = value.match(/(?:github\.com\/)(([-\w.]+)\/([-\w.]+))/)
  if (urlMatch) {
    return { username: urlMatch[2], repo: urlMatch[3] }
  }

  const shorthandMatch = value.match(/^\s*([-\w.]+)\/([-\w.]+)\s*$/)
  if (shorthandMatch) {
    return { username: shorthandMatch[1], repo: shorthandMatch[2] }
  }

  return null
}

/**
 * The hero's primary control: a terminal-style field that ingests a repository
 * and routes to its workspace. Owns the ingestion request and the loading
 * state; the API contract is unchanged from the previous landing page.
 */
export function CommandBar() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [repoUrl, setRepoUrl] = useState("")
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [loadingText, setLoadingText] = useState("Analyzing repository...")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleAnalyze = useCallback(async () => {
    const parsed = parseRepoInput(repoUrl)

    if (!parsed) {
      setError(
        repoUrl.trim() === ""
          ? "Enter a GitHub repository to map."
          : "That does not look like a repository. Use owner/name or a github.com URL."
      )
      inputRef.current?.focus()
      return
    }

    const { username, repo } = parsed
    setError(null)
    setIsAnalyzing(true)
    setLoadingText("Fetching repository data...")

    try {
      setLoadingText("Analyzing repository...")
      const response = await fetch("/api/collect-repo-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, repo, force_refresh: true }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to analyze repository")
      }

      setLoadingText("Repository analyzed successfully")
      await new Promise((resolve) => setTimeout(resolve, 800))
      router.push(`/${username}/${repo}`)
    } catch (err) {
      console.error("Failed to analyze repository:", err)
      setError(err instanceof Error ? err.message : "Failed to analyze repository")
      setIsAnalyzing(false)
      setLoadingText("Analyzing repository...")
    }
  }, [repoUrl, router])

  if (isAnalyzing) {
    return (
      <div className="flex min-h-[220px] w-full max-w-[640px] items-center justify-center">
        <EnhancedLoading loadingText={loadingText} />
      </div>
    )
  }

  return (
    <div id="map" className="flex w-full max-w-[640px] flex-col gap-3.5 scroll-mt-24">
      <div className="ca-ticks flex items-center gap-2.5 rounded-sm border border-white/20 bg-card px-4 py-3.5 shadow-[0_0_0_1px_hsl(var(--primary)/0.08),0_12px_40px_rgba(0,0,0,0.4)] focus-within:border-primary/60">
        <span aria-hidden="true" className="font-mono text-[15px] text-primary">
          &gt;
        </span>
        <input
          ref={inputRef}
          value={repoUrl}
          onChange={(e) => {
            setRepoUrl(e.target.value)
            if (error) setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              handleAnalyze()
            }
          }}
          placeholder="github.com/your-org/your-repo"
          aria-label="GitHub repository URL or owner/name"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "command-bar-error" : undefined}
          className="min-w-0 flex-1 border-none bg-transparent font-mono text-sm text-foreground outline-none placeholder:text-faint"
        />
        <kbd className="hidden rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-faint sm:inline-block">
          ⏎
        </kbd>
      </div>

      {error && (
        <p id="command-bar-error" role="alert" className="font-mono text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={handleAnalyze}
          className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Map Repository
        </button>
        <a
          href="#platform"
          className="rounded-lg border border-white/20 px-5 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary/60"
        >
          View Demo
        </a>
      </div>

      <RepoChips onPick={(repo) => {
        setRepoUrl(repo)
        setError(null)
        inputRef.current?.focus()
      }} />
    </div>
  )
}
