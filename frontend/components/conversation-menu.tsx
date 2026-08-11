"use client"

import { useCallback, useEffect, useState } from "react"
import { History, Plus, Trash2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface ConversationSummary {
  id: string
  title: string
  updatedAt: string
  messageCount: number
}

interface ConversationMenuProps {
  username: string
  repo: string
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
}

/**
 * Saved conversation picker.
 *
 * Renders nothing unless the deployment has persistence *and* the visitor is
 * signed in — an empty history dropdown for someone who can never have one is
 * just a dead control (D-29). The list is fetched when the menu opens rather
 * than on mount, so a signed-out visitor costs no query at all.
 */
export function ConversationMenu({
  username,
  repo,
  activeId,
  onSelect,
  onNew,
}: ConversationMenuProps) {
  const [available, setAvailable] = useState(false)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/conversations?owner=${encodeURIComponent(username)}&repo=${encodeURIComponent(repo)}`
      )
      const body = await res.json()
      if (!body.success) return

      setAvailable(Boolean(body.data.persistence && body.data.signedIn))
      setConversations(body.data.conversations ?? [])
    } catch {
      // History is a convenience; failing to load it must not disturb the chat.
      setAvailable(false)
    } finally {
      setLoading(false)
    }
  }, [username, repo])

  // One probe on mount decides whether the control should exist at all.
  useEffect(() => {
    void load()
  }, [load])

  const remove = async (id: string, event: React.MouseEvent) => {
    // Without this the row's own click handler also fires and opens what we
    // are deleting.
    event.preventDefault()
    event.stopPropagation()

    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" })
    if (!res.ok) return

    setConversations((prev) => prev.filter((c) => c.id !== id))
    if (id === activeId) onNew()
  }

  if (!available) return null

  return (
    <DropdownMenu onOpenChange={(open) => open && void load()}>
      <DropdownMenuTrigger
        aria-label="Saved conversations"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/45 hover:text-foreground"
      >
        <History className="h-3.5 w-3.5" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Conversations
        </DropdownMenuLabel>

        <DropdownMenuItem onSelect={onNew} className="gap-2">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          New conversation
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {loading && (
          <div className="px-2 py-3 text-xs text-muted-foreground">Loading…</div>
        )}

        {!loading && conversations.length === 0 && (
          <div className="px-2 py-3 text-xs text-muted-foreground">
            Nothing saved yet. Ask a question and it will be kept here.
          </div>
        )}

        {conversations.map((conversation) => (
          <DropdownMenuItem
            key={conversation.id}
            onSelect={() => onSelect(conversation.id)}
            className="flex items-start justify-between gap-2"
            aria-current={conversation.id === activeId ? "true" : undefined}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs text-foreground">{conversation.title}</span>
              <span className="block text-[11px] text-muted-foreground">
                {conversation.messageCount} message{conversation.messageCount === 1 ? "" : "s"}
                {" · "}
                {new Date(conversation.updatedAt).toLocaleDateString()}
              </span>
            </span>

            <button
              type="button"
              aria-label={`Delete conversation "${conversation.title}"`}
              onClick={(event) => void remove(conversation.id, event)}
              className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
