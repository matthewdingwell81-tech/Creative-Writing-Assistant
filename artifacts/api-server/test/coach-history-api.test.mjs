import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "../../../lib/db/node_modules/pg/lib/index.js";

const origin = process.env.LUMINA_TEST_URL || "http://localhost:80";
function client() {
  let cookie = "";
  return async (path, method = "GET", body) => {
    const res = await fetch(`${origin}/api${path}`, {
      method, headers: { Cookie: cookie, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (res.headers.getSetCookie().length) cookie = res.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
    const text = await res.text();
    return { status: res.status, data: text ? JSON.parse(text) : null, cache: res.headers.get("cache-control") };
  };
}
test("Coach cross-device persistence, ownership, concurrency, expiry and deletion", async () => {
  const owner = client(), secondDevice = client(), other = client(), anonymous = client();
  const username = `coach_test_${randomUUID().slice(0, 12)}`, password = randomUUID();
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let doc;
  const ids = [];
  try {
    const signup = await owner("/auth/register", "POST", { username, password });
    assert.equal(signup.status, 201); ids.push(signup.data.id);
    const foreign = await other("/auth/register", "POST", { username: `coach_test_${randomUUID().slice(0, 12)}`, password: randomUUID() });
    ids.push(foreign.data.id);
    assert.equal((await secondDevice("/auth/login", "POST", { username, password })).status, 200);
    doc = (await owner("/documents", "POST", { title: "Coach test", content: "", documentType: "fiction" })).data.id;
    const path = `/documents/${doc}/coach-history`;
    const pair = [{ role: "user", content: "Question" }, { role: "assistant", content: "Already completed answer" }];
    const body = { messages: pair, draft: "Unsent prompt", revision: 0 };
    assert.equal((await anonymous(path)).status, 401);
    for (const method of ["GET", "PUT", "DELETE"]) assert.equal((await other(path, method, method === "PUT" ? body : undefined)).status, 404);
    assert.equal((await owner("/documents/bad/coach-history")).status, 400);
    assert.equal((await owner(path, "PUT", { ...body, messages: [pair[0]] })).status, 400);
    assert.equal((await owner(path, "PUT", { ...body, messages: Array(82).fill(pair).flat() })).status, 400);
    assert.equal((await owner(path, "PUT", { ...body, revision: 0.5 })).status, 400);
    assert.equal((await owner(path, "PUT", { ...body, draft: "x".repeat(20001) })).status, 400);
    const saved = await owner(path, "PUT", body);
    assert.equal(saved.status, 200);
    assert.equal(saved.cache, "no-store");
    assert.deepEqual((await secondDevice(path)).data, saved.data);
    assert.equal((await secondDevice(path, "PUT", body)).status, 409);
    const readAgain = await owner(path);
    assert.equal(readAgain.data.updatedAt, saved.data.updatedAt, "reads do not extend retention");
    const reset = await secondDevice(path, "DELETE");
    assert.deepEqual(reset.data.messages, []);
    assert.equal(reset.data.draft, "");
    assert.equal((await owner(path, "PUT", { ...body, revision: saved.data.revision })).status, 409);
    const importedAt = Date.now() - 29 * 86400000;
    const imported = await owner(path, "PUT", { ...body, revision: reset.data.revision, importedAt });
    assert.equal(imported.data.updatedAt, importedAt);
    assert.equal((await owner(path, "PUT", { ...body, revision: imported.data.revision, importedAt: Date.now() - 31 * 86400000 })).status, 400);
    await pool.query("UPDATE coach_history SET updated_at = now() - interval '31 days' WHERE document_id = $1", [doc]);
    const expired = await secondDevice(path);
    assert.deepEqual(expired.data.messages, []);
    assert.equal(expired.data.draft, "");
    assert.ok(expired.data.revision > imported.data.revision);
    assert.equal((await owner(path, "PUT", { ...body, revision: imported.data.revision })).status, 409);
    const row = (await pool.query("SELECT messages, draft FROM coach_history WHERE document_id = $1", [doc])).rows[0];
    assert.deepEqual(row, { messages: [], draft: "" });
    await owner(`/documents/${doc}`, "DELETE");
    assert.equal((await pool.query("SELECT 1 FROM coach_history WHERE document_id = $1", [doc])).rowCount, 0);
    assert.equal((await owner(path)).status, 404);
  } finally {
    for (const id of ids) await pool.query("DELETE FROM users WHERE id = $1", [id]);
    await pool.end();
  }
});
