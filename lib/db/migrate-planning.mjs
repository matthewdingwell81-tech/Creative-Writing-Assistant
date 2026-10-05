import { readFile } from "node:fs/promises";
import pg from "pg";

// Explicit additive migration: never reconcile/drop unrelated managed tables.
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  await pool.query(await readFile(new URL("./migrations/story-planning.sql", import.meta.url), "utf8"));
  console.info("Story planning migration applied.");
} finally {
  await pool.end();
}
