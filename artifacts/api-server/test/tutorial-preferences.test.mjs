import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: [new URL("../src/routes/tutorial-preferences.ts", import.meta.url).pathname],
  bundle: true, platform: "node", format: "esm", write: false,
  banner: { js: `import { createRequire } from "node:module"; const require = createRequire(${JSON.stringify(import.meta.url)});` },
});
const { createTutorialPreferencesRouter } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);

async function exercise({ account = "first", method = "GET", body, origin, fail = false } = {}) {
  const accounts = new Map([["first", true], ["second", true]]);
  const calls = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.session = { userId: account || undefined }; next(); });
  app.use(createTutorialPreferencesRouter({
    async getTutorialsEnabled(userId) {
      calls.push(["get", userId]);
      if (fail) throw new Error("Private database details");
      return accounts.get(userId);
    },
    async updateTutorialsEnabled(userId, enabled) {
      calls.push(["update", userId, enabled]);
      if (fail) throw new Error("Private database details");
      if (!accounts.has(userId)) return undefined;
      accounts.set(userId, enabled);
      return enabled;
    },
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${baseUrl}/tutorial-preferences`, {
      method,
      headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: response.status,
      body: await response.json(),
      calls,
      accounts,
      sameOrigin: `${baseUrl}`,
    };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test("existing accounts default to tutorials enabled", async () => {
  const result = await exercise();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { enabled: true });
  assert.deepEqual(result.calls, [["get", "first"]]);
});

test("turning tutorials off persists for that account only", async () => {
  const disabled = await exercise({ method: "PATCH", body: { enabled: false } });
  assert.equal(disabled.status, 200);
  assert.deepEqual(disabled.body, { enabled: false });
  assert.deepEqual(disabled.calls, [["update", "first", false]]);
  assert.equal(disabled.accounts.get("first"), false);
  assert.equal(disabled.accounts.get("second"), true);

  const otherAccount = await exercise({ account: "second" });
  assert.deepEqual(otherAccount.body, { enabled: true });
  assert.deepEqual(otherAccount.calls, [["get", "second"]]);
});

test("signed-out users and invalid writes cannot access or change the preference", async () => {
  const signedOutGet = await exercise({ account: "" });
  assert.equal(signedOutGet.status, 401);
  assert.deepEqual(signedOutGet.calls, []);
  const signedOutWrite = await exercise({ account: "", method: "PATCH", body: { enabled: false } });
  assert.equal(signedOutWrite.status, 401);
  assert.deepEqual(signedOutWrite.calls, []);
  for (const body of [{}, { enabled: "false" }, { enabled: false, accountId: "second" }]) {
    const invalid = await exercise({ method: "PATCH", body });
    assert.equal(invalid.status, 400);
    assert.deepEqual(invalid.calls, []);
  }
});

test("cross-origin updates are rejected and storage errors do not leak details", async () => {
  const crossOrigin = await exercise({ method: "PATCH", body: { enabled: false }, origin: "https://unrelated.example" });
  assert.equal(crossOrigin.status, 403);
  assert.deepEqual(crossOrigin.calls, []);

  const unavailable = await exercise({ fail: true });
  assert.equal(unavailable.status, 503);
  assert.doesNotMatch(JSON.stringify(unavailable.body), /Private database details/);
});
