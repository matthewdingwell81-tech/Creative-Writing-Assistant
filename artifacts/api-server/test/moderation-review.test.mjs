import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import express from "express";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: [new URL("../src/routes/moderation.ts", import.meta.url).pathname],
  bundle: true, platform: "node", format: "esm", write: false,
  banner: { js: `import { createRequire } from "node:module"; const require = createRequire(${JSON.stringify(import.meta.url)});` },
});
const { createModerationRouter } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
const [developerUid] = JSON.parse(await readFile(new URL("../src/lib/developerIds.json", import.meta.url), "utf8"));

async function exercise({ account = "developer", method = "GET", path = "/safety-flags", body, origin, conflict = false, unavailable = false } = {}) {
  const calls = [];
  const app = express();
  app.use(express.json());
  // Test-only identity setup; production derives this from express-session.
  app.use((req, _res, next) => { req.session = { userId: account || undefined }; next(); });
  app.use(createModerationRouter({
    async getUserById(id) { return { firebaseUid: id === "developer" ? developerUid : "ordinary-user" }; },
    async listFlags(status) {
      calls.push({ action: "list", status });
      if (unavailable) throw new Error("Private database detail");
      return [{ id: 1, requestContext: "PRIVATE_REVIEW_CONTEXT" }];
    },
    async countOpenFlags() {
      calls.push({ action: "count" });
      if (unavailable) throw new Error("Private database detail");
      return 3;
    },
    async reviewFlag(id, decision, note, reviewerId) {
      calls.push({ action: "review", id, decision, note, reviewerId });
      if (conflict) return undefined;
      return { id, status: decision, reviewedAt: new Date().toISOString() };
    },
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let responseBody;
    try { responseBody = JSON.parse(text); } catch { responseBody = { error: "Invalid JSON request" }; }
    return { status: response.status, headers: response.headers, body: responseBody, calls };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test("signed-out visitors cannot read flags", async () => {
  const result = await exercise({ account: "" });
  assert.equal(result.status, 401);
  assert.deepEqual(result.calls, []);
  const count = await exercise({ account: "", path: "/safety-flags/count" });
  assert.equal(count.status, 401);
  assert.deepEqual(count.calls, []);
});

test("ordinary users cannot read private flags or review them", async () => {
  for (const method of ["GET", "POST"]) {
    const result = await exercise({
      account: "ordinary", method,
      path: method === "GET" ? "/safety-flags" : "/safety-flags/1/review",
      body: method === "POST" ? { decision: "confirmed_violation", firebaseUid: developerUid, reviewerId: "developer" } : undefined,
    });
    assert.equal(result.status, 403);
    assert.deepEqual(result.calls, []);
    assert.doesNotMatch(JSON.stringify(result.body), /PRIVATE_REVIEW_CONTEXT/);
  }
  const count = await exercise({ account: "ordinary", path: "/safety-flags/count" });
  assert.equal(count.status, 403);
  assert.deepEqual(count.calls, []);
});

test("developer allowlisted accounts can read flags without cacheable private content", async () => {
  const result = await exercise();
  assert.equal(result.status, 200);
  assert.equal(result.body.flags[0].requestContext, "PRIVATE_REVIEW_CONTEXT");
  assert.equal(result.headers.get("cache-control"), "no-store");
});

test("status filters are validated and forwarded", async () => {
  const result = await exercise({ path: "/safety-flags?status=no_violation" });
  assert.equal(result.calls[0].status, "no_violation");
  const invalid = await exercise({ path: "/safety-flags?status=not-a-status" });
  assert.equal(invalid.status, 400);
  assert.deepEqual(invalid.calls, []);
});

test("developer allowlisted accounts can read the pending count without caching", async () => {
  const result = await exercise({ path: "/safety-flags/count" });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { count: 3 });
  assert.deepEqual(result.calls, [{ action: "count" }]);
  assert.equal(result.headers.get("cache-control"), "no-store");
});

test("administrator decisions use the authenticated reviewer and trim notes", async () => {
  const result = await exercise({
    method: "POST", path: "/safety-flags/1/review",
    body: { decision: "no_violation", note: "  Benign writing  ", reviewerId: "spoofed", userId: "spoofed" },
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.calls[0], { action: "review", id: 1, decision: "no_violation", note: "Benign writing", reviewerId: "developer" });
});

test("cross-site origins cannot read flags or submit administrator decisions", async () => {
  for (const method of ["GET", "POST"]) {
    const result = await exercise({ method, origin: "https://unrelated.example", path: method === "GET" ? "/safety-flags" : "/safety-flags/1/review", body: method === "POST" ? { decision: "no_violation" } : undefined });
    assert.equal(result.status, 403);
    assert.deepEqual(result.calls, []);
  }
});

test("invalid review decisions and oversized notes are rejected", async () => {
  for (const body of [{ decision: "suspend" }, { decision: "no_violation", note: "x".repeat(2001) }, null]) {
    const result = await exercise({ method: "POST", path: "/safety-flags/1/review", body });
    assert.equal(result.status, 400);
    assert.deepEqual(result.calls, []);
  }
});

test("a previously reviewed flag cannot be overwritten", async () => {
  const result = await exercise({ method: "POST", path: "/safety-flags/1/review", body: { decision: "no_violation" }, conflict: true });
  assert.equal(result.status, 409);
});

test("database outages return a clear error without leaking internal details", async () => {
  const result = await exercise({ unavailable: true });
  assert.equal(result.status, 503);
  assert.doesNotMatch(JSON.stringify(result.body), /Private database detail/);
  const count = await exercise({ path: "/safety-flags/count", unavailable: true });
  assert.equal(count.status, 503);
  assert.doesNotMatch(JSON.stringify(count.body), /Private database detail/);
});
