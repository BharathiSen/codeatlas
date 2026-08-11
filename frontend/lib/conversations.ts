import { and, asc, desc, eq, sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { conversations, messages, repositories, users } from "@/lib/db/schema"
import { logger } from "@/lib/logger"

/**
 * Saved conversations.
 *
 * Every function here degrades to "not persisted" rather than throwing. A
 * database outage must cost a user their history, not their ability to ask a
 * question — the same posture retrieval takes (D-25) and sign-in takes (D-27).
 * Answering has never needed a database and must not start now.
 */

export interface ConversationSummary {
  id: string
  title: string
  updatedAt: string
  messageCount: number
}

export interface StoredMessage {
  role: "user" | "assistant"
  content: string
  citedPaths: string[] | null
  createdAt: string
}

/** Long enough to recognise, short enough to sit in a list. */
const TITLE_MAX = 80

/** First line of the opening question, trimmed — good enough, and free. */
export function deriveTitle(firstQuestion: string): string {
  const line = firstQuestion.trim().split("\n")[0].trim()
  if (!line) return "Untitled conversation"
  return line.length <= TITLE_MAX ? line : `${line.slice(0, TITLE_MAX - 1)}…`
}

/**
 * Find or create the user row for a GitHub id.
 *
 * Lazy: a row appears on the first action worth persisting rather than at
 * sign-in, so the table holds people who actually have content. `onConflictDo`
 * makes it safe under the concurrent requests a single page load produces.
 */
async function ensureUser(githubId: string, login?: string): Promise<string | null> {
  const db = getDb()
  if (!db) return null

  const [row] = await db
    .insert(users)
    .values({ githubId, githubLogin: login ?? null })
    .onConflictDoUpdate({
      target: users.githubId,
      set: { lastSeenAt: sql`now()`, githubLogin: login ?? sql`${users.githubLogin}` },
    })
    .returning({ id: users.id })

  return row?.id ?? null
}

async function ensureRepository(owner: string, name: string): Promise<string | null> {
  const db = getDb()
  if (!db) return null

  const [row] = await db
    .insert(repositories)
    .values({ owner, name })
    // A no-op update rather than `onConflictDoNothing`, because the latter
    // returns no row when it collides and we need the id either way.
    .onConflictDoUpdate({ target: [repositories.owner, repositories.name], set: { owner } })
    .returning({ id: repositories.id })

  return row?.id ?? null
}

/** This user's conversations about this repository, most recently used first. */
export async function listConversations(
  githubId: string,
  owner: string,
  repo: string
): Promise<ConversationSummary[]> {
  const db = getDb()
  if (!db) return []

  try {
    const rows = await db
      .select({
        id: conversations.id,
        title: conversations.title,
        updatedAt: conversations.updatedAt,
        messageCount: sql<number>`count(${messages.id})::int`,
      })
      .from(conversations)
      .innerJoin(users, eq(users.id, conversations.userId))
      .innerJoin(repositories, eq(repositories.id, conversations.repositoryId))
      .leftJoin(messages, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(users.githubId, githubId),
          eq(repositories.owner, owner),
          eq(repositories.name, repo)
        )
      )
      .groupBy(conversations.id)
      .orderBy(desc(conversations.updatedAt))
      .limit(50)

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      updatedAt: r.updatedAt.toISOString(),
      messageCount: r.messageCount,
    }))
  } catch (error) {
    logger.error(`Failed to list conversations: ${error}`, { prefix: "DB" })
    return []
  }
}

/**
 * Load one conversation's messages.
 *
 * Scoped by `githubId` in the query itself rather than fetched-then-checked, so
 * there is no path where a wrong id returns someone else's conversation.
 */
export async function getConversation(
  githubId: string,
  conversationId: string
): Promise<{ id: string; title: string; messages: StoredMessage[] } | null> {
  const db = getDb()
  if (!db) return null

  try {
    const [conversation] = await db
      .select({ id: conversations.id, title: conversations.title })
      .from(conversations)
      .innerJoin(users, eq(users.id, conversations.userId))
      .where(and(eq(conversations.id, conversationId), eq(users.githubId, githubId)))
      .limit(1)

    if (!conversation) return null

    const rows = await db
      .select({
        role: messages.role,
        content: messages.content,
        citedPaths: messages.citedPaths,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.conversationId, conversation.id))
      .orderBy(asc(messages.createdAt))

    return {
      id: conversation.id,
      title: conversation.title,
      messages: rows.map((r) => ({
        role: r.role,
        content: r.content,
        citedPaths: r.citedPaths,
        createdAt: r.createdAt.toISOString(),
      })),
    }
  } catch (error) {
    logger.error(`Failed to load conversation: ${error}`, { prefix: "DB" })
    return null
  }
}

export interface TurnToPersist {
  githubId: string
  githubLogin?: string
  owner: string
  repo: string
  /** Omit to start a new conversation; the title is derived from the question. */
  conversationId?: string
  question: string
  answer: string
  citedPaths?: string[]
  tokenCount?: number
  model?: string
}

/**
 * Persist one question-and-answer turn, creating the conversation if needed.
 *
 * Returns the conversation id so the client can keep appending to it, or `null`
 * when persistence is unavailable — which the caller treats as "this chat is
 * ephemeral", not as an error.
 */
export async function persistTurn(turn: TurnToPersist): Promise<string | null> {
  const db = getDb()
  if (!db) return null

  try {
    const [userId, repositoryId] = await Promise.all([
      ensureUser(turn.githubId, turn.githubLogin),
      ensureRepository(turn.owner, turn.repo),
    ])
    if (!userId || !repositoryId) return null

    return await db.transaction(async (tx) => {
      let conversationId = turn.conversationId

      if (conversationId) {
        // Ownership is re-checked here, not assumed from the client's id.
        const [owned] = await tx
          .select({ id: conversations.id })
          .from(conversations)
          .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
          .limit(1)
        if (!owned) conversationId = undefined
      }

      if (!conversationId) {
        const [created] = await tx
          .insert(conversations)
          .values({ userId, repositoryId, title: deriveTitle(turn.question) })
          .returning({ id: conversations.id })
        conversationId = created.id
      } else {
        await tx
          .update(conversations)
          .set({ updatedAt: sql`now()` })
          .where(eq(conversations.id, conversationId))
      }

      await tx.insert(messages).values([
        { conversationId, role: "user", content: turn.question },
        {
          conversationId,
          role: "assistant",
          content: turn.answer,
          citedPaths: turn.citedPaths ?? null,
          tokenCount: turn.tokenCount ?? null,
          model: turn.model ?? null,
        },
      ])

      return conversationId
    })
  } catch (error) {
    logger.error(`Failed to persist conversation turn: ${error}`, { prefix: "DB" })
    return null
  }
}

/** Delete a conversation the caller owns. Returns whether anything was deleted. */
export async function deleteConversation(
  githubId: string,
  conversationId: string
): Promise<boolean> {
  const db = getDb()
  if (!db) return false

  try {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.githubId, githubId))
      .limit(1)
    if (!user) return false

    const deleted = await db
      .delete(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, user.id)))
      .returning({ id: conversations.id })

    // Messages go with it by cascade — deletion has to actually delete.
    return deleted.length > 0
  } catch (error) {
    logger.error(`Failed to delete conversation: ${error}`, { prefix: "DB" })
    return false
  }
}
