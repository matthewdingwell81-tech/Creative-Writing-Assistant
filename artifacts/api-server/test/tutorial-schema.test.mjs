import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { build } from "esbuild";
import bcrypt from "bcryptjs";

const bundle = await build({
  entryPoints: [new URL("../src/lib/tutorial-schema.ts", import.meta.url).pathname],
  bundle: true, platform: "node", format: "esm", write: false,
});
const { assertTutorialSchemaReady } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);

test("startup readiness is read-only and rejects a missing schema before serving requests", async () => {
  const queries = [];
  await assert.rejects(assertTutorialSchemaReady({
    async query(sql) { queries.push(sql); throw new Error("column does not exist"); },
  }), /re-publish/);
  assert.deepEqual(queries, ["SELECT tutorials_enabled FROM users LIMIT 0"]);
});

test("an older schema upgrades without losing existing sign-in credentials or tutorial preferences", {
  skip: !process.env.DATABASE_URL || process.env.NODE_ENV === "production",
}, async () => {
  // A connection-local temporary users table shadows public.users. No real
  // account/schema is modified, and rollback removes all test changes.
  const require = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
  const { Client } = require("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`CREATE TEMP TABLE users (
      id text PRIMARY KEY, username text NOT NULL UNIQUE, password text NOT NULL,
      firebase_uid varchar(128), created_at timestamptz NOT NULL DEFAULT now()
    )`);
    const password = "isolated-migration-test-password";
    await client.query("INSERT INTO users (id, username, password) VALUES ($1, $2, $3)", [
      "existing-account", "existing-writer", await bcrypt.hash(password, 4),
    ]);
    await client.query("SAVEPOINT before_readiness_check");
    await assert.rejects(assertTutorialSchemaReady(client), /schema is not ready/);
    await client.query("ROLLBACK TO SAVEPOINT before_readiness_check");

    // This models the supported order: development migration / Publish schema
    // diff first, then read-only startup readiness and application queries.
    const migration = await readFile(new URL("../../../lib/db/migrations/tutorial-preferences.sql", import.meta.url), "utf8");
    await client.query(migration);
    await assertTutorialSchemaReady(client);
    const existing = (await client.query("SELECT * FROM users WHERE username = $1", ["existing-writer"])).rows[0];
    assert.equal(existing.id, "existing-account");
    assert.equal(await bcrypt.compare(password, existing.password), true);
    assert.equal(existing.tutorials_enabled, true);

    await client.query("UPDATE users SET tutorials_enabled = false WHERE id = $1", [existing.id]);
    await client.query(migration);
    const preference = (await client.query("SELECT tutorials_enabled FROM users WHERE id = $1", [existing.id])).rows[0];
    assert.equal(preference.tutorials_enabled, false, "reapplying the migration must preserve opt-outs");
    await client.query("INSERT INTO users (id, username, password) VALUES ($1, $2, $3)", [
      "new-account", "new-writer", existing.password,
    ]);
    assert.equal((await client.query("SELECT tutorials_enabled FROM users WHERE id = $1", ["new-account"])).rows[0].tutorials_enabled, true);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
});
