import { relations } from "drizzle-orm"
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

/**
 * Relational schema.
 *
 * Follows the design in the notebook's §11 with two deliberate departures:
 *
 * - **No `chunks` table.** That was designed when retrieval was unbuilt and
 *   pgvector was a candidate. Qdrant owns vectors now (D-25), and a second home
 *   for them would be two sources of truth for the same index.
 * - **`conversations`, not `sessions`.** "Session" now means an auth session;
 *   reusing it for a saved chat would make every reference ambiguous in a
 *   codebase that has both.
 *
 * `usage_events` is also not built. Quota lives in Redis and works; a table that
 * duplicates it earns its place when there is cost reporting to serve, not before.
 */

/**
 * A signed-in GitHub user.
 *
 * Rows appear lazily on the first action worth persisting rather than at
 * sign-in, so an account exists only once it owns something. `github_id` is the
 * numeric id, which survives a username change — `github_login` is display only
 * and is refreshed opportunistically.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /*
     * Text, not bigint: this is an identifier we compare and never compute on,
     * and storing it as a string keeps it exactly as GitHub and the session
     * report it — no width or precision question to get wrong later.
     */
    githubId: text("github_id").notNull(),
    githubLogin: text("github_login"),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_github_id_idx").on(table.githubId)]
)

/**
 * A repository someone has held a conversation about.
 *
 * Not a mirror of GitHub — only what is needed to scope and label a saved
 * conversation. Ingestion state stays in Redis and Qdrant, which already own it.
 */
export const repositories = pgTable(
  "repositories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("repositories_owner_name_idx").on(table.owner, table.name)]
)

/**
 * A saved chat, scoped to one user and one repository.
 *
 * `ON DELETE CASCADE` from both parents: a conversation has no meaning without
 * the user who owns it, and deleting a user must actually delete their content
 * rather than orphan it — that is the deletion story a retention policy needs.
 */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    /** Derived from the opening question; the user may rename it. */
    title: text("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The list query: this user's conversations about this repository, newest first.
    index("conversations_user_repo_idx").on(table.userId, table.repositoryId, table.updatedAt),
  ]
)

/**
 * One turn of a conversation.
 *
 * `citedPaths` is stored alongside the text so a reopened conversation can
 * restore its clickable citations without re-parsing the markdown — and so a
 * future "which files does this repo get asked about" question is a query
 * rather than a scrape.
 */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    citedPaths: text("cited_paths").array(),
    tokenCount: integer("token_count"),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("messages_conversation_idx").on(table.conversationId, table.createdAt)]
)

export const usersRelations = relations(users, ({ many }) => ({
  conversations: many(conversations),
}))

export const repositoriesRelations = relations(repositories, ({ many }) => ({
  conversations: many(conversations),
}))

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(users, { fields: [conversations.userId], references: [users.id] }),
  repository: one(repositories, {
    fields: [conversations.repositoryId],
    references: [repositories.id],
  }),
  messages: many(messages),
}))

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}))

export type Conversation = typeof conversations.$inferSelect
export type Message = typeof messages.$inferSelect
