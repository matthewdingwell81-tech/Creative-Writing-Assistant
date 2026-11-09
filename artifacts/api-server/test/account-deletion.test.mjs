import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: [new URL("../src/routes/account-deletion.ts", import.meta.url).pathname],
  bundle: true, platform: "node", format: "esm", write: false,
  banner: { js: `import { createRequire } from "node:module"; const require = createRequire(${JSON.stringify(import.meta.url)});` },
});
const { createAccountDeletionRouter } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);

async function exercise({
  account = "free-user", body = { confirmation: "DELETE" }, origin,
  objectFailure = false, firebaseFailure = false, accountMissing = false,
  firebaseUid = null,
} = {}) {
  const calls = [];
  let sessionDestroyed = false;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = {
      userId: account || undefined,
      destroy(callback) { sessionDestroyed = true; callback(); },
    };
    next();
  });
  app.use(createAccountDeletionRouter({
    async getAccountDeletionData(userId) {
      calls.push(["load", userId]);
      return accountMissing ? undefined : {
        firebaseUid,
        objectPaths: ["/objects/uploads/first", "/objects/uploads/second"],
      };
    },
    async deleteAccount(userId) {
      calls.push(["delete-account", userId]);
      return !accountMissing;
    },
  }, {
    async deleteObject(path) {
      calls.push(["delete-object", path]);
      if (objectFailure) throw new Error("storage details");
    },
    async deleteFirebaseIdentity(uid) {
      calls.push(["delete-firebase", uid]);
      if (firebaseFailure) throw new Error("firebase details");
    },
  }));

  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${baseUrl}/account`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(origin ? { Origin: origin } : {}),
      },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      body: response.status === 204 ? null : await response.json(),
      calls,
      sessionDestroyed,
      baseUrl,
    };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test("a Free account can permanently delete its account, uploaded data, and sessions", async () => {
  const result = await exercise();
  assert.equal(result.status, 204);
  assert.deepEqual(result.calls, [
    ["load", "free-user"],
    ["delete-object", "/objects/uploads/first"],
    ["delete-object", "/objects/uploads/second"],
    ["delete-account", "free-user"],
  ]);
  assert.equal(result.sessionDestroyed, true);
});

test("Google-linked accounts also remove their Firebase identity", async () => {
  const result = await exercise({ firebaseUid: "firebase-user" });
  assert.equal(result.status, 204);
  assert.deepEqual(result.calls.slice(-2), [
    ["delete-firebase", "firebase-user"],
    ["delete-account", "free-user"],
  ]);
});

test("deletion requires exact confirmation, a signed-in session, and a same-origin request", async () => {
  const badConfirmation = await exercise({ body: { confirmation: "delete" } });
  assert.equal(badConfirmation.status, 400);
  assert.deepEqual(badConfirmation.calls, []);

  const signedOut = await exercise({ account: "" });
  assert.equal(signedOut.status, 401);
  assert.deepEqual(signedOut.calls, []);

  const crossOrigin = await exercise({ origin: "https://unrelated.example" });
  assert.equal(crossOrigin.status, 403);
  assert.deepEqual(crossOrigin.calls, []);
});

test("storage and identity failures do not delete the account or reveal provider details", async () => {
  const storageFailure = await exercise({ objectFailure: true });
  assert.equal(storageFailure.status, 503);
  assert.equal(storageFailure.calls.some(([name]) => name === "delete-account"), false);
  assert.doesNotMatch(JSON.stringify(storageFailure.body), /storage details/);

  const identityFailure = await exercise({ firebaseFailure: true, firebaseUid: "firebase-user" });
  assert.equal(identityFailure.status, 503);
  assert.equal(identityFailure.calls.some(([name]) => name === "delete-account"), false);
  assert.doesNotMatch(JSON.stringify(identityFailure.body), /firebase details/);
});
