"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight } from "lucide-react"
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
    <div id="map" className="mx-auto flex w-full max-w-[600px] flex-col gap-4 scroll-mt-24">
      <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-2 pl-4 transition-colors focus-within:border-primary/60">
        <span aria-hidden="true" className="font-mono text-sm text-primary">
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
          placeholder="github.com/owner/repository"
          aria-label="GitHub repository URL or owner/name"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "command-bar-error" : undefined}
          className="min-w-0 flex-1 border-none bg-transparent py-2 font-mono text-sm text-foreground outline-none placeholder:text-faint"
        />
        <button
          type="button"
          onClick={handleAnalyze}
          className="ca-btn-gradient inline-flex flex-none items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold"
        >
          Map repository
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {error && (
        <p id="command-bar-error" role="alert" className="font-mono text-xs text-destructive">
          {error}
        </p>
      )}

      <RepoChips onPick={(repo) => {
        setRepoUrl(repo)
        setError(null)
        inputRef.current?.focus()
      }} />
    </div>
  )
}
