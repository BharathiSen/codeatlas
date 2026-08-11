import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

/*
 * Unmount between tests. Testing Library only auto-registers this when vitest
 * `globals` is enabled; without it every render stacks another copy of the
 * component in the same document and queries start matching several elements.
 */
afterEach(cleanup)

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

// This setup file runs for node-environment tests too, where none of these
// globals exist — guard so pure logic tests are not broken by DOM shims.
if (typeof globalThis.document !== "undefined") {
  globalThis.ResizeObserver ??= NoopObserver as never
  globalThis.IntersectionObserver ??= NoopObserver as never

  // Radix calls this during focus management; jsdom has no layout engine.
  Element.prototype.scrollIntoView ??= function scrollIntoView() {}
}
