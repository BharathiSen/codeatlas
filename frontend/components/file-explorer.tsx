"use client"

import { useMemo, useState } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  ChevronDown,
  ChevronRight,
  FileCode,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Package,
  Search,
  X,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface FileNode {
  name: string
  path: string
  type: "file" | "directory"
  content?: string
  children?: FileNode[]
  loaded?: boolean
}

interface FileExplorerProps {
  repoData: {
    files: FileNode[]
  }
}

/** Icon per file kind. Tokenised — the tree is not a place for a second palette. */
function FileIcon({ name }: { name: string }) {
  const cls = "h-3.5 w-3.5 flex-none"

  if (name === "package.json" || name === "package-lock.json") {
    return <Package className={cn(cls, "text-primary")} aria-hidden="true" />
  }

  switch (name.split(".").pop()?.toLowerCase()) {
    case "js":
    case "jsx":
    case "ts":
    case "tsx":
    case "py":
    case "go":
    case "rs":
      return <FileCode className={cn(cls, "text-primary")} aria-hidden="true" />
    case "json":
    case "yml":
    case "yaml":
    case "toml":
      return <FileJson className={cn(cls, "text-accent-3")} aria-hidden="true" />
    case "png":
    case "jpg":
    case "jpeg":
    case "svg":
    case "gif":
    case "webp":
      return <ImageIcon className={cn(cls, "text-accent-2")} aria-hidden="true" />
    default:
      return <FileText className={cn(cls, "text-muted-foreground")} aria-hidden="true" />
  }
}

/**
 * Keep a node when it matches, or when any descendant does.
 *
 * The previous implementation filtered each level independently, so a folder
 * whose own name did not match was dropped before its children were considered —
 * meaning nothing nested was ever findable. Filtering has to run bottom-up.
 */
function filterTree(nodes: FileNode[], query: string): FileNode[] {
  if (!query) return nodes
  const needle = query.toLowerCase()

  const walk = (list: FileNode[]): FileNode[] =>
    list.reduce<FileNode[]>((kept, node) => {
      const selfMatches = node.name.toLowerCase().includes(needle)
      const children = node.children ? walk(node.children) : []

      if (selfMatches || children.length > 0) {
        kept.push({ ...node, children: children.length > 0 ? children : node.children })
      }
      return kept
    }, [])

  return walk(nodes)
}

function countFiles(nodes: FileNode[]): number {
  return nodes.reduce(
    (total, node) =>
      total + (node.type === "file" ? 1 : 0) + (node.children ? countFiles(node.children) : 0),
    0
  )
}

/** Every directory path in the tree — used to expand everything while searching. */
function allDirectoryPaths(nodes: FileNode[]): string[] {
  return nodes.flatMap((node) =>
    node.type === "directory"
      ? [node.path, ...(node.children ? allDirectoryPaths(node.children) : [])]
      : []
  )
}

export default function FileExplorer({ repoData }: FileExplorerProps) {
  const router = useRouter()
  const pathname = usePathname() || "/"
  const searchParams = useSearchParams()
  const [username = "", repo = ""] = pathname.split("/").slice(1)

  const activeFile = searchParams?.get("file") ?? null
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Memoised so the `?? []` fallback does not produce a new array identity on
  // every render, which would defeat every downstream useMemo.
  const files = useMemo(() => repoData?.files ?? [], [repoData?.files])
  const visible = useMemo(() => filterTree(files, query.trim()), [files, query])
  const matchCount = useMemo(() => (query.trim() ? countFiles(visible) : 0), [visible, query])

  // While searching, every surviving branch is open — a hidden match is no match.
  const searchExpanded = useMemo(
    () => (query.trim() ? new Set(allDirectoryPaths(visible)) : null),
    [visible, query]
  )
  const isExpanded = (path: string) => searchExpanded?.has(path) ?? expanded.has(path)

  const toggleFolder = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })

  const openFile = (path: string) => {
    if (activeFile === path) return
    router.push(`/${username}/${repo}?file=${encodeURIComponent(path)}`)
  }

  if (!repoData?.files) {
    return (
      <div className="flex h-full flex-col gap-2 p-4" aria-busy="true" aria-label="Loading files">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-5 bg-muted" style={{ width: `${90 - i * 6}%` }} />
        ))}
      </div>
    )
  }

  const renderNodes = (nodes: FileNode[], level = 0) =>
    nodes.map((node) => {
      const open = isExpanded(node.path)
      const isActive = node.type === "file" && node.path === activeFile

      return (
        <li key={node.path} role="none">
          <button
            type="button"
            role="treeitem"
            aria-expanded={node.type === "directory" ? open : undefined}
            aria-selected={isActive}
            aria-level={level + 1}
            title={node.path}
            onClick={() =>
              node.type === "directory" ? toggleFolder(node.path) : openFile(node.path)
            }
            style={{ paddingLeft: `${level * 12 + 8}px` }}
            className={cn(
              "flex w-full items-center gap-1.5 rounded py-1.5 pr-2 text-left transition-colors",
              isActive
                ? "bg-primary/[0.12] text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {node.type === "directory" ? (
              <>
                {open ? (
                  <ChevronDown className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
                )}
                {open ? (
                  <FolderOpen className="h-3.5 w-3.5 flex-none text-primary" aria-hidden="true" />
                ) : (
                  <Folder className="h-3.5 w-3.5 flex-none text-primary/70" aria-hidden="true" />
                )}
              </>
            ) : (
              <>
                <span className="w-3.5 flex-none" aria-hidden="true" />
                <FileIcon name={node.name} />
              </>
            )}
            <span className="truncate font-mono text-xs">{node.name}</span>
          </button>

          {node.type === "directory" && open && node.children && node.children.length > 0 && (
            <ul role="group" className="list-none p-0">
              {renderNodes(node.children, level + 1)}
            </ul>
          )}
        </li>
      )
    })

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex-none border-b border-border p-3">
        <div className="mb-3 flex items-center gap-1 truncate font-mono text-sm">
          <Link href={`/${username}`} className="text-primary hover:underline">
            {username}
          </Link>
          <span className="text-faint">/</span>
          <a
            href={`https://github.com/${username}/${repo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-foreground hover:text-primary"
          >
            {repo}
          </a>
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder="Search files…"
            aria-label="Search files by name"
            className="h-8 border-border bg-muted pl-8 pr-8 font-mono text-xs"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        {query.trim() && (
          <p role="status" aria-live="polite" className="mt-2 font-mono text-[11px] text-faint">
            {matchCount} {matchCount === 1 ? "file" : "files"} matching “{query.trim()}”
          </p>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {visible.length === 0 ? (
          <p className="p-6 text-center text-xs text-muted-foreground">
            {query.trim() ? "No files match that search." : "This repository has no files to show."}
          </p>
        ) : (
          <ul role="tree" aria-label="Repository files" className="list-none p-2">
            {renderNodes(visible)}
          </ul>
        )}
      </ScrollArea>
    </div>
  )
}
