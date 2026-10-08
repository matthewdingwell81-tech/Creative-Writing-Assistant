import { readFile } from "node:fs/promises";
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  await pool.query(await readFile(new URL("./migrations/coach-history.sql", import.meta.url), "utf8"));
  console.info("Coach history additive migration applied.");
} finally {
  await pool.end();
}
