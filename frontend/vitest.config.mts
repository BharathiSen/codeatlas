/*
 * React 19 exports `act` only from its development build. If NODE_ENV is
 * inherited as "production" — which happens in some shells and CI images —
 * module resolution picks the production build and @testing-library/react fails
 * with "React.act is not a function". Pinning it here makes the test run
 * independent of the surrounding environment.
 */
process.env.NODE_ENV = "test"

import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "node:path"

export default defineConfig({
  plugins: [react()],
  test: {
    // Node by default; component tests opt into jsdom with a per-file
    // `// @vitest-environment jsdom` pragma, so pure logic tests stay fast.
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "components/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
    // Threads start far faster than forks on Windows; booting a jsdom
    // environment in a forked worker regularly exceeded the default handshake
    // timeout here.
    pool: "threads",
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
    },
  },
})
