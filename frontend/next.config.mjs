import { config as loadEnv } from 'dotenv'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/*
 * Environment lives at the repository root, not in frontend/.
 *
 * Next.js only reads .env files from its own project root and does not walk up,
 * so one shared file for both the web app and the ingestion service has to be
 * loaded explicitly. This runs before the config is exported, which is early
 * enough for both server-side reads and NEXT_PUBLIC_* build-time inlining.
 *
 * dotenv does not overwrite variables that are already set, so a real
 * environment (CI, Docker, Vercel, Render) always wins over the file.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/*
 * Variables the runtime owns. Next sets NODE_ENV itself and only wires up its
 * CSS/PostCSS loader chain for the standard values, so letting a .env file
 * inject a non-standard one silently breaks Tailwind. PORT is the server's to
 * decide too. Both are ignored no matter what the file says.
 */
const RESERVED = new Set(['NODE_ENV', 'PORT'])

// The first file to define a key wins, so highest precedence comes first:
// .env.local overrides .env, and both yield to the real environment.
for (const file of ['.env.local', '.env']) {
  const path = resolve(repoRoot, file)
  if (!existsSync(path)) continue

  // `processEnv: {}` parses without mutating process.env, so we control exactly
  // which keys are applied.
  const parsed = loadEnv({ path, processEnv: {}, quiet: true }).parsed ?? {}

  for (const [key, value] of Object.entries(parsed)) {
    if (RESERVED.has(key)) continue
    if (process.env[key] === undefined) process.env[key] = value
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  experimental: {
    webpackBuildWorker: true,
    parallelServerBuildTraces: true,
    parallelServerCompiles: true,
  },
}

export default nextConfig
