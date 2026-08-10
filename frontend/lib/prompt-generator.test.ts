import { describe, expect, it } from "vitest"
import {
  applyTokenBudget,
  estimateTokens,
  generatePrompt,
  selectHistory,
  type ConversationMessage,
} from "./prompt-generator"

describe("estimateTokens", () => {
  it("scales with length", () => {
    expect(estimateTokens("")).toBe(0)
    expect(estimateTokens("a".repeat(4))).toBe(1)
    expect(estimateTokens("a".repeat(4000))).toBe(1000)
  })

  it("rounds up so a partial token is never free", () => {
    expect(estimateTokens("abc")).toBe(1)
  })
})

describe("selectHistory", () => {
  const turn = (i: number): ConversationMessage => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `message ${i}`,
  })

  it("returns nothing for empty or invalid input", () => {
    expect(selectHistory([])).toEqual([])
    expect(selectHistory(undefined as never)).toEqual([])
  })

  it("keeps only the most recent turns", () => {
    const history = Array.from({ length: 20 }, (_, i) => turn(i))
    const selected = selectHistory(history, 4)

    expect(selected).toHaveLength(4)
    expect(selected[3].content).toBe("message 19")
    expect(selected[0].content).toBe("message 16")
  })

  it("drops blank messages", () => {
    const selected = selectHistory([
      { role: "user", content: "   " },
      { role: "assistant", content: "kept" },
    ])

    expect(selected).toHaveLength(1)
    expect(selected[0].content).toBe("kept")
  })

  it("normalises any non-user role to assistant", () => {
    const selected = selectHistory([{ role: "system", content: "x" }])
    expect(selected[0].role).toBe("assistant")
  })

  it("clips an oversized message so it cannot crowd out the codebase", () => {
    const selected = selectHistory([{ role: "user", content: "x".repeat(5000) }])

    expect(selected[0].content.length).toBeLessThan(5000)
    expect(selected[0].content).toContain("[truncated]")
  })
})

describe("applyTokenBudget", () => {
  it("passes content through untouched when it fits", () => {
    const content = "small content"
    const result = applyTokenBudget(content, 10, 1000)

    expect(result.truncated).toBe(false)
    expect(result.content).toBe(content)
  })

  it("truncates and marks content that exceeds the budget", () => {
    const content = "x".repeat(40_000) // ~10k tokens
    const result = applyTokenBudget(content, 100, 1_000)

    expect(result.truncated).toBe(true)
    expect(result.content.length).toBeLessThan(content.length)
    expect(result.content).toContain("truncated")
  })

  it("keeps the result within the budget it was given", () => {
    const content = "x".repeat(100_000)
    const maxTokens = 2_000
    const result = applyTokenBudget(content, 500, maxTokens)

    // The truncation marker adds a little, so allow a small margin.
    expect(result.estimatedTokens).toBeLessThanOrEqual(maxTokens + 50)
  })

  it("does not go negative when overhead alone exceeds the budget", () => {
    const result = applyTokenBudget("x".repeat(1000), 5_000, 1_000)

    expect(result.truncated).toBe(true)
    expect(result.content.length).toBeGreaterThanOrEqual(0)
  })
})

describe("generatePrompt", () => {
  const tree = "src/\n  index.ts"
  const content = "console.log('hi')"

  it("embeds the query, tree and content", async () => {
    const prompt = await generatePrompt("How does routing work?", [], tree, content)

    expect(prompt).toContain("How does routing work?")
    expect(prompt).toContain(tree)
    expect(prompt).toContain(content)
  })

  it("says so explicitly when there is no history", async () => {
    const prompt = await generatePrompt("q", [], tree, content)
    expect(prompt).toContain("first question in the conversation")
  })

  it("labels history turns by speaker", async () => {
    const prompt = await generatePrompt(
      "and the other one?",
      [
        { role: "user", content: "what is auth.ts" },
        { role: "assistant", content: "it validates sessions" },
      ],
      tree,
      content
    )

    expect(prompt).toContain("User: what is auth.ts")
    expect(prompt).toContain("Assistant: it validates sessions")
  })

  it("switches to the README contract for README requests", async () => {
    const prompt = await generatePrompt(
      "Create a README.md for this repository",
      [],
      tree,
      content
    )

    expect(prompt).toContain("README GENERATION")
    // The README branch replaces the general INSTRUCTIONS block entirely.
    expect(prompt).not.toContain("Match your response length and detail")
  })

  it("uses the general instructions for ordinary questions", async () => {
    const prompt = await generatePrompt("what is this repo?", [], tree, content)

    expect(prompt).toContain("Match your response length and detail")
    expect(prompt).not.toContain("README GENERATION")
  })
})
