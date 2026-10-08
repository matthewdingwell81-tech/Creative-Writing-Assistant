import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { expireCoachHistory } from "./routes/coach-history";
import coachMigration from "../../../lib/db/migrations/coach-history.sql";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function startServer() {
  try {
    // This additive migration also gives existing accounts their selected
    // seven-day trial start date without Drizzle reconciliation.
    await pool.query(
      'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "created_at" timestamptz NOT NULL DEFAULT now()',
    );
    // Bundle the reviewed additive SQL so published servers can start with a
    // fresh schema too; do not depend on workspace-only post-merge setup.
    await pool.query(coachMigration);
    await expireCoachHistory();
  } catch (err) {
    logger.error({ err }, "Could not apply startup migrations or Coach retention cleanup");
    process.exit(1);
  }

  setInterval(() => {
    void expireCoachHistory().catch(err => logger.error({ err }, "Coach retention cleanup failed"));
  }, 60 * 60 * 1000).unref();
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

void startServer();
