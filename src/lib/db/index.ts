import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import path from "node:path";
import { dataDir } from "@/lib/paths";
import { migrations } from "./migrations";
import * as schema from "./schema";

export type Db = PgliteDatabase<typeof schema>;

// Embedded Postgres (PGlite) keeps local development server-free while
// staying on Postgres semantics (jsonb, tsvector) for a later move to a
// hosted database. Cached on globalThis so dev hot reloads reuse one handle.
const globalForDb = globalThis as unknown as { __rlDb?: Promise<Db> };

async function open(): Promise<Db> {
  const dir = process.env.RL_DB_DIR ?? path.join(dataDir(), "pglite");
  const client = new PGlite(dir === ":memory:" ? undefined : dir);
  await client.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const applied = await client.query<{ id: string }>("SELECT id FROM schema_migrations");
  const done = new Set(applied.rows.map((r) => r.id));
  for (const m of migrations) {
    if (done.has(m.id)) continue;
    await client.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.query("INSERT INTO schema_migrations (id) VALUES ($1)", [m.id]);
    });
  }
  return drizzle(client, { schema });
}

export function db(): Promise<Db> {
  globalForDb.__rlDb ??= open();
  return globalForDb.__rlDb;
}

export { schema };
