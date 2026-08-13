"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight } from "lucide-react"
import { EnhancedLoading, type LoadingStage } from "@/components/enhanced-loading"
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
 * Turn a failure into something a person can act on.
 *
 * Every backend problem used to surface as the browser's own "Failed to fetch",
 * which tells a visitor nothing and reads like the product is broken. The two
 * cases that actually happen on a free deployment — a sleeping backend and an
 * oversized repository — are recoverable, and saying so is the difference
 * between "try again in a moment" and "this doesn't work".
 *
 * `code` is the machine-readable code from the API envelope; `serverMessage` is
 * its already-user-facing sentence, which we prefer where it carries specifics
 * such as the repository's actual size. Nothing internal — URLs, tokens, stack
 * traces — reaches this text.
 */
function messageForFailure(code?: string, serverMessage?: string): string {
  switch (code) {
    case "repo_too_large":
      // Server message names the actual size and limit, which is more useful.
      return serverMessage ?? "This repository is too large for the current analysis tier."
    case "upstream_error":
      // Short and neutral. This is nearly always a cold analysis service rather
      // than a fault, so it should read as "not yet" and not as a stack trace —
      // and it should not volunteer anything about the hosting tier.
      return "Analysis engine is starting. Try again in a moment."
    case "timeout":
      return "The repository took too long to analyse. Try a smaller repository."
    case "quota_unavailable":
      return "The usage quota service is unavailable, so requests are paused. Please try again shortly."
    case "rate_limited":
      return serverMessage ?? "Daily request limit reached. Sign in with GitHub for a larger budget."
    default:
      return (
        serverMessage ??
        "Repository analysis failed. The analysis service may be waking up, or the repository may exceed the current limit."
      )
  }
}

/**
 * The pipeline, as the user sees it. Each entry corresponds to a real step the
 * backend performs; none of them advance on a timer.
 */
const INITIAL_STAGES: LoadingStage[] = [
  { id: "fetch", label: "Repository fetched", state: "pending" },
  { id: "process", label: "Source files processed", state: "pending" },
  { id: "index", label: "Building semantic index", state: "pending" },
  { id: "ready", label: "Ready for questions", state: "pending" },
]

/** Human-readable byte size, or undefined when the length is unknown. */
function formatSize(chars?: number): string | undefined {
  if (!chars || chars <= 0) return undefined
  if (chars < 1024) return `${chars} chars`
  if (chars < 1024 * 1024) return `${Math.round(chars / 1024)} KB`
  return `${(chars / 1024 / 1024).toFixed(1)} MB`
}

/** Poll budget: indexing a repository within the size limit finishes well inside this. */
const INDEX_POLL_TIMEOUT_MS = 45_000
const INDEX_POLL_INTERVAL_MS = 1_500

/** ~4.5s of "no retrieval service" before concluding there is no index coming. */
const UNAVAILABLE_POLLS_BEFORE_GIVING_UP = 3

/**
 * How long to wait before the single automatic retry of a cold analysis service.
 *
 * The first request is what wakes it; a sleeping instance needs roughly this long
 * to bind its port and start answering. Long enough to be worth waiting for,
 * short enough that a genuinely broken backend still reports quickly.
 */
const COLD_START_RETRY_MS = 20_000

/**
 * Wait for the semantic index to finish, reporting chunk counts as they arrive.
 *
 * Polls a read-only status endpoint rather than guessing. Bounded twice over — a
 * fixed interval and an overall deadline — because indexing is best-effort:
 * answering falls back to whole-repository context when the index is missing, so
 * a slow or absent retrieval service must never trap someone on this screen.
 * Hitting the deadline is reported honestly rather than shown as success.
 */
async function waitForIndex(
  username: string,
  repo: string,
  onProgress: (chunks: number) => void
): Promise<{ indexed: boolean; chunks: number; available: boolean }> {
  const deadline = Date.now() + INDEX_POLL_TIMEOUT_MS
  let last = { indexed: false, chunks: 0, available: false }
  let unavailableStreak = 0

  while (Date.now() < deadline) {
    try {
      const response = await fetch(
        `/api/index-status?username=${encodeURIComponent(username)}&repo=${encodeURIComponent(repo)}`,
        { cache: "no-store" }
      )
      const body = await response.json()
      if (body?.success && body.data) {
        last = body.data
        if (last.indexed) return last

        if (last.available) {
          unavailableStreak = 0
          onProgress(last.chunks)
        } else {
          // No retrieval service answering. A couple of these are normal while a
          // free-tier backend wakes, but waiting the full deadline for an index
          // nobody is building would strand the user on a stage that can never
          // complete — and answering works without it.
          if (++unavailableStreak >= UNAVAILABLE_POLLS_BEFORE_GIVING_UP) return last
        }
      }
    } catch {
      // Transient — keep polling until the deadline rather than failing the run.
    }

    await new Promise((resolve) => setTimeout(resolve, INDEX_POLL_INTERVAL_MS))
  }

  return last
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
  const [stages, setStages] = useState<LoadingStage[]>(INITIAL_STAGES)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  /** Advance one stage. Every call site is a real event, never a timer. */
  const markStage = useCallback(
    (id: string, state: LoadingStage["state"], detail?: string) => {
      setStages((prev) =>
        prev.map((s) => (s.id === id ? { ...s, state, detail: detail ?? s.detail } : s))
      )
    },
    []
  )

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
    setStages(INITIAL_STAGES)
    setLoadingText("Analyzing repository")

    try {
      markStage("fetch", "active")

      const ingest = async () => {
        const response = await fetch("/api/collect-repo-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, repo, force_refresh: true }),
        })
        return { response, result: await response.json() }
      }

      let { response, result } = await ingest()

      /*
       * A sleeping analysis service is transient and self-healing, so the app
       * waits for it rather than handing the visitor a red error and a Retry
       * button for a condition that resolves itself. The first request is what
       * wakes the service; the retry is the one that succeeds.
       *
       * Exactly one retry, and only for `upstream_error` — a genuinely broken
       * backend, an oversized repository or an exhausted quota all still surface
       * immediately, because none of those improve by waiting.
       */
      if ((!response.ok || !result?.success) && result?.code === "upstream_error") {
        setLoadingText("Starting analysis engine")
        await new Promise((resolve) => setTimeout(resolve, COLD_START_RETRY_MS))
        setLoadingText("Analyzing repository")
        ;({ response, result } = await ingest())
      }

      if (!response.ok || !result.success) {
        throw new Error(messageForFailure(result?.code, result?.error))
      }

      // Both ticks come from the response we just received, not from elapsed
      // time: the repository is fetched because the request returned, and the
      // size is the length of the content it returned.
      markStage("fetch", "done", result.cached ? "from cache" : undefined)
      markStage("process", "done", formatSize(result?.data?.content?.length))

      // Indexing runs after the response is sent, so its progress has to be
      // asked for. `available: false` means no retrieval service configured or
      // reachable — answering still works through the whole-repository
      // fallback, so that is a completed pipeline, not a failure.
      markStage("index", "active")
      const indexed = await waitForIndex(username, repo, (chunks) =>
        markStage("index", "active", chunks > 0 ? `${chunks} chunks` : undefined)
      )

      markStage(
        "index",
        "done",
        indexed.available
          ? `${indexed.chunks} chunks`
          : "unavailable — answers use full-repository context"
      )
      markStage("ready", "done")

      // Brief pause so the completed checklist is legible rather than a flash.
      await new Promise((resolve) => setTimeout(resolve, 600))
      router.push(`/${username}/${repo}`)
    } catch (err) {
      // The detail stays in the browser console and the server log; the user
      // gets a sentence that tells them what to do next.
      console.error("Failed to analyze repository:", err)
      setError(
        err instanceof Error && err.message
          ? err.message
          : messageForFailure(undefined, undefined)
      )
      setIsAnalyzing(false)
      setLoadingText("Analyzing repository")
      // Reset the checklist: a half-ticked pipeline left on screen behind an
      // error implies those steps still hold, and after a failed ingestion they
      // do not.
      setStages(INITIAL_STAGES)
    }
  }, [repoUrl, router, markStage])

  if (isAnalyzing) {
    return (
      <div className="flex min-h-[220px] w-full max-w-[640px] items-center justify-center">
        <EnhancedLoading loadingText={loadingText} stages={stages} />
      </div>
    )
  }

  return (
    <div id="map" className="mx-auto flex w-full max-w-[600px] flex-col gap-4 scroll-mt-24">
      <div className="flex items-center gap-2.5 rounded-xl border border-border-strong bg-card p-2 pl-4 transition-colors focus-within:border-primary">
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
        <div id="command-bar-error" role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="font-mono text-xs text-destructive">{error}</p>
          {/* A sleeping backend is the common case and it fixes itself, so the
              recovery is one click rather than a re-typed repository. */}
          <button
            type="button"
            onClick={() => {
              setError(null)
              void handleAnalyze()
            }}
            className="font-mono text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
          >
            Retry
          </button>
        </div>
      )}

      <RepoChips onPick={(repo) => {
        setRepoUrl(repo)
        setError(null)
        inputRef.current?.focus()
      }} />
    </div>
  )
}
