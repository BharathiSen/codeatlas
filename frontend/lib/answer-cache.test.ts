import { describe, expect, it } from "vitest"
import { answerCacheKey, isCacheableQuestion, normaliseQuery } from "./answer-cache"

describe("normaliseQuery", () => {
  it("treats case, spacing and trailing punctuation as noise", () => {
    expect(normaliseQuery("  What Does   This Do?? ")).toBe("what does this do")
  })

  it("keeps two genuinely different questions apart", () => {
    expect(normaliseQuery("how does auth work")).not.toBe(normaliseQuery("how does billing work"))
  })

  it("does not stem or drop stop words", () => {
    // Merging "test" and "tests" would serve the wrong answer to save a call.
    expect(normaliseQuery("run the test")).not.toBe(normaliseQuery("run the tests"))
  })
})

describe("answerCacheKey", () => {
  it("collides for questions that differ only in noise", () => {
    expect(answerCacheKey("o", "r", "What does this do?")).toBe(
      answerCacheKey("o", "r", "what does this do")
    )
  })

  it("is scoped per repository", () => {
    // The same question about a different repository is a different answer.
    expect(answerCacheKey("o", "r1", "what is this")).not.toBe(
      answerCacheKey("o", "r2", "what is this")
    )
    expect(answerCacheKey("o1", "r", "what is this")).not.toBe(
      answerCacheKey("o2", "r", "what is this")
    )
  })

  it("is bounded regardless of question length", () => {
    // The question is user input heading for a Redis key.
    const key = answerCacheKey("o", "r", "x".repeat(10_000))
    expect(key.length).toBeLessThan(80)
  })

  it("cannot inject key structure from the question", () => {
    const key = answerCacheKey("o", "r", "a:b:c answer:v1:evil:evil:0000")
    expect(key.startsWith("answer:v1:o:r:")).toBe(true)
    expect(key.split(":")).toHaveLength(5)
  })
})

describe("isCacheableQuestion", () => {
  const base = { query: "what is this", historyLength: 0, fileScoped: false }

  it("caches a fresh, repository-wide question", () => {
    expect(isCacheableQuestion(base)).toBe(true)
  })

  it("refuses a follow-up", () => {
    // "why?" means nothing without what came before, so one caller's answer is
    // not another's.
    expect(isCacheableQuestion({ ...base, query: "why?", historyLength: 2 })).toBe(false)
  })

  it("refuses a file-scoped question", () => {
    // The real key would be (question + which file is open), which this is not.
    expect(isCacheableQuestion({ ...base, fileScoped: true })).toBe(false)
  })

  it("refuses a question that is only punctuation", () => {
    expect(isCacheableQuestion({ ...base, query: "???" })).toBe(false)
  })
})
