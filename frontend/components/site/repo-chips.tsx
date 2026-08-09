"use client"

import { EXAMPLE_REPOS } from "@/lib/site-content"

interface RepoChipsProps {
  /** Called with the chosen `owner/name` so the caller can fill its input. */
  onPick: (repo: string) => void
}

/** One-tap example repositories shown under the command bar. */
export function RepoChips({ onPick }: RepoChipsProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2.5">
      <span className="text-[13px] text-muted-foreground">Try an example</span>
      {EXAMPLE_REPOS.map((repo) => (
        <button
          key={repo}
          type="button"
          onClick={() => onPick(repo)}
          className="rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          {repo}
        </button>
      ))}
    </div>
  )
}
