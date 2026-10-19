import { readFile } from "node:fs/promises";
import pg from "pg";

// Explicit additive migration: avoid reconciling the externally managed sessions table.
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  await pool.query(await readFile(new URL("./migrations/tutorial-preferences.sql", import.meta.url), "utf8"));
  console.info("Tutorial preferences migration applied.");
} finally {
  await pool.end();
}
