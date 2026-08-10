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

// dotenv never overwrites an already-set variable, so the FIRST file to define
// a key wins. Highest precedence therefore comes first: .env.local overrides
// .env, and both yield to anything already in the real environment.
for (const file of ['.env.local', '.env']) {
  const path = resolve(repoRoot, file)
  if (existsSync(path)) {
    loadEnv({ path })
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
