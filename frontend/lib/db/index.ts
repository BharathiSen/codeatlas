import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { logger } from "@/lib/logger"
import * as schema from "./schema"

/**
 * Database handle.
 *
 * Persistence is **optional**, exactly as sign-in is (D-27). With no
 * `DATABASE_URL` the app behaves as it always has: conversations live in the
 * browser tab and vanish with it. Every caller therefore has to cope with `null`
 * rather than assume a database — which is what keeps a Postgres outage from
 * taking down question answering, a feature that never needed it.
 */

let client: ReturnType<typeof postgres> | null = null
let database: ReturnType<typeof drizzle<typeof schema>> | null = null

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL)
}

export function getDb() {
  if (!isDatabaseConfigured()) return null
  if (database) return database

  /*
   * Kept small and short-lived. Route handlers are invoked concurrently and,
   * on a serverless host, from many instances at once; a large per-instance
   * pool is how a modest amount of traffic exhausts Postgres' connection limit.
   */
  client = postgres(process.env.DATABASE_URL!, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  })

  database = drizzle(client, { schema })
  logger.info("Database connection initialised", { prefix: "DB" })
  return database
}

export { schema }
