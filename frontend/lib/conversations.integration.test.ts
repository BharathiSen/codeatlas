import { afterAll, beforeAll, describe, expect, it } from "vitest"

/**
 * Integration tests against a real Postgres.
 *
 * Excluded from `pnpm test` — run with a database up:
 *
 *   VITEST_INTEGRATION=true DATABASE_URL=postgres://... pnpm test
 *
 * These exist because the interesting properties here are the ones a mocked
 * database cannot show: that a cascade actually cascades, that a unique index
 * makes concurrent upserts safe, and above all that one user's id cannot reach
 * another user's conversation. Those are claims about SQL, so they are tested
 * against SQL.
 */

import {
  deleteConversation,
  deriveTitle,
  getConversation,
  listConversations,
  persistTurn,
} from "./conversations"
import { getDb, isDatabaseConfigured } from "./db"
import { conversations, messages, repositories, users } from "./db/schema"

const ALICE = "int-test-alice"
const BOB = "int-test-bob"
const OWNER = "int-test-owner"
const REPO = "widgets"

async function wipe() {
  const db = getDb()
  if (!db) return
  // Conversations and messages disappear with their user by cascade.
  await db.delete(messages)
  await db.delete(conversations)
  await db.delete(users)
  await db.delete(repositories)
}

beforeAll(async () => {
  if (!isDatabaseConfigured()) throw new Error("DATABASE_URL is required for integration tests")
  await wipe()
})

afterAll(wipe)

describe("deriveTitle", () => {
  it("uses the first line of the opening question", () => {
    expect(deriveTitle("How does auth work?\nand also this")).toBe("How does auth work?")
  })

  it("bounds a long question so it fits a list", () => {
    expect(deriveTitle("x".repeat(500))).toHaveLength(80)
  })

  it("never produces an empty title", () => {
    expect(deriveTitle("   \n  ")).toBe("Untitled conversation")
  })
})

describe("persistTurn", () => {
  it("creates a conversation titled from the first question", async () => {
    const id = await persistTurn({
      githubId: ALICE, githubLogin: "alice", owner: OWNER, repo: REPO,
      question: "How does authentication work?", answer: "Via GitHub OAuth.",
    })

    expect(id).toEqual(expect.any(String))
    expect((await getConversation(ALICE, id!))!.title).toBe("How does authentication work?")
  })

  it("appends to an existing conversation rather than starting a new one", async () => {
    const id = await persistTurn({
      githubId: ALICE, owner: OWNER, repo: REPO, question: "first", answer: "a",
    })
    await persistTurn({
      githubId: ALICE, owner: OWNER, repo: REPO, conversationId: id!, question: "second", answer: "b",
    })

    const loaded = await getConversation(ALICE, id!)
    expect(loaded!.messages.map((m) => m.role)).toEqual([
      "user", "assistant", "user", "assistant",
    ])
    expect(loaded!.messages.map((m) => m.content)).toEqual(["first", "a", "second", "b"])
  })

  it("upserts the user rather than duplicating them across turns", async () => {
    await persistTurn({ githubId: ALICE, owner: OWNER, repo: REPO, question: "q1", answer: "a" })
    await persistTurn({ githubId: ALICE, owner: OWNER, repo: REPO, question: "q2", answer: "a" })

    const rows = await getDb()!.select().from(users)
    expect(rows.filter((r) => r.githubId === ALICE)).toHaveLength(1)
  })

  it("does not let a borrowed conversation id append to someone else's thread", async () => {
    // The client supplies this id, so it is not to be trusted.
    const aliceId = await persistTurn({
      githubId: ALICE, owner: OWNER, repo: REPO, question: "alice only", answer: "a",
    })

    const bobId = await persistTurn({
      githubId: BOB, owner: OWNER, repo: REPO, conversationId: aliceId!,
      question: "sneaky", answer: "b",
    })

    expect(bobId).not.toBe(aliceId)
    const alice = await getConversation(ALICE, aliceId!)
    expect(alice!.messages.map((m) => m.content)).not.toContain("sneaky")
  })
})

describe("listConversations", () => {
  it("scopes to the user and the repository, with a message count", async () => {
    const id = await persistTurn({
      githubId: ALICE, owner: OWNER, repo: REPO, question: "scoped", answer: "a",
    })
    await persistTurn({
      githubId: ALICE, owner: OWNER, repo: REPO, conversationId: id!, question: "more", answer: "b",
    })

    const mine = await listConversations(ALICE, OWNER, REPO)
    expect(mine.find((c) => c.id === id)!.messageCount).toBe(4)

    expect(await listConversations(ALICE, OWNER, "a-different-repo")).toHaveLength(0)
    expect((await listConversations(BOB, OWNER, REPO)).some((c) => c.id === id)).toBe(false)
  })
})

describe("access control", () => {
  it("reports another user's conversation as missing, not forbidden", async () => {
    const id = await persistTurn({
      githubId: ALICE, owner: OWNER, repo: REPO, question: "private", answer: "a",
    })

    // 404 rather than 403: confirming the id exists is itself a leak.
    expect(await getConversation(BOB, id!)).toBeNull()
  })

  it("refuses to delete another user's conversation", async () => {
    const id = await persistTurn({
      githubId: ALICE, owner: OWNER, repo: REPO, question: "keep me", answer: "a",
    })

    expect(await deleteConversation(BOB, id!)).toBe(false)
    expect(await getConversation(ALICE, id!)).not.toBeNull()
  })

  it("deletes a conversation and its messages together", async () => {
    const id = await persistTurn({
      githubId: ALICE, owner: OWNER, repo: REPO, question: "temporary", answer: "a",
    })

    expect(await deleteConversation(ALICE, id!)).toBe(true)
    expect(await getConversation(ALICE, id!)).toBeNull()

    const orphans = await getDb()!.select().from(messages)
    expect(orphans.some((m) => m.conversationId === id)).toBe(false)
  })
})
