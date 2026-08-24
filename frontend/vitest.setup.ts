import { afterEach, beforeAll } from "vitest"

/*
 * Env the route handlers read at module load. Set here so importing a route in a
 * test does not depend on a developer's local .env — tests must be hermetic.
 */
process.env.REDIS_URL ||= "redis://localhost:6379"
process.env.GITINGEST_API_URL ||= "http://localhost:8000"
process.env.NEXT_PUBLIC_APP_URL ||= "http://localhost:3000"

/*
 * jsdom implements neither observer API, and Radix primitives (ScrollArea in
 * particular) construct a ResizeObserver on mount. Without these, any component
 * rendering inside a ScrollArea throws before it can be asserted on.
 */
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

/*
 * Everything below is DOM-only, and that includes the imports.
 *
 * This setup file runs in every worker, but only two of the nine test files ask
 * for jsdom — the rest are pure logic. Importing jest-dom and testing-library at
 * the top level made the other seven workers each load a DOM testing stack they
 * can never use, and the cost was not academic: worker startup is bounded by a
 * hardcoded 60s handshake in vitest, and the two jsdom workers were losing that
 * race against the CPU contention the wasted imports created. They failed to
 * start, and the suite reported 90 of 116 tests while calling itself a pass.
 *
 * Loading them behind the environment check is what makes the DOM cost land only
 * where a DOM exists. `document` is the discriminator vitest itself uses.
 */
if (typeof globalThis.document !== "undefined") {
  /*
   * Hooks rather than top-level await: tsconfig targets ES6, where a top-level
   * await is a compile error, and the target is the whole application's to set —
   * not something a test setup file should move. `beforeAll` runs before any test
   * in the file, which is early enough to register jest-dom's matchers.
   */
  beforeAll(async () => {
    await import("@testing-library/jest-dom/vitest")
  })

  /*
   * Unmount between tests. Testing Library only auto-registers this when vitest
   * `globals` is enabled; without it every render stacks another copy of the
   * component in the same document and queries start matching several elements.
   *
   * The import is resolved once and cached by the module registry, so paying for
   * it here rather than at the top level costs nothing after the first test.
   */
  afterEach(async () => {
    const { cleanup } = await import("@testing-library/react")
    cleanup()
  })

  globalThis.ResizeObserver ??= NoopObserver as never
  globalThis.IntersectionObserver ??= NoopObserver as never

  // Radix calls this during focus management; jsdom has no layout engine.
  Element.prototype.scrollIntoView ??= function scrollIntoView() {}
}
