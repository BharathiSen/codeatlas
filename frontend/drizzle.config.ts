import { config as loadEnv } from "dotenv"
import { defineConfig } from "drizzle-kit"
import { resolve } from "node:path"

// Environment lives at the repository root, and drizzle-kit runs outside Next,
// so it does not get next.config.mjs' loading for free. Resolved from the
// working directory because drizzle-kit bundles this config before evaluating
// it, which leaves `import.meta.dirname` undefined.
loadEnv({ path: resolve(process.cwd(), "..", ".env"), quiet: true })

/**
 * Migrations are written to `database/migrations` rather than under `frontend/`:
 * the schema describes the deployment, not the web app, and `database/` was
 * reserved for exactly this (§4).
 */
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "../database/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5435/codeatlas",
  },
  strict: true,
  verbose: true,
})
