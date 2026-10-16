// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import type { Server } from "node:http";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import type {} from "../../../api-server/src/types/session";
import { createFirebaseSessionRouter } from "../../../api-server/src/routes/firebase-session";
import { verifyFirebaseIdToken } from "../../../api-server/src/lib/firebaseAuth";
import type { AuthRepository } from "../../../api-server/src/lib/firebaseSession";
import { developerSubscription } from "../../../api-server/src/lib/subscriptions";

// Exercise the real HTTP router/session middleware and signature verifier with
// a test-only key/repository. No live Firebase identity or database is changed.
const requireApi = createRequire(new URL("../../../api-server/package.json", import.meta.url));
const express = requireApi("express");
const session = requireApi("express-session");
const uid = "b609ec1f-1c63-49e7-8f84-2cee1ab6f311";
type User = NonNullable<Awaited<ReturnType<AuthRepository["getUserById"]>>>;
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let jwks: ReturnType<typeof createLocalJWKSet>;
const servers: Server[] = [];
beforeAll(async () => {
  keys = await generateKeyPair("RS256");
  jwks = createLocalJWKSet({ keys: [await exportJWK(keys.publicKey)] });
});
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve()); server.closeAllConnections();
  })));
});
async function token(overrides: Record<string, unknown> = {}) {
  return new SignJWT({ email: "developer@example.test", email_verified: true, ...overrides })
    .setSubject(uid).setAudience("lumina-app-22fd7")
    .setIssuer("https://securetoken.google.com/lumina-app-22fd7")
    .setIssuedAt().setExpirationTime("1h")
    .setProtectedHeader({ alg: "RS256" }).sign(keys.privateKey);
}
async function fixture() {
  const records = new Map<string, User>();
  const existing: User = {
    id: "server-account", username: "developer@example.test", password: "unusable-test-password",
    firebaseUid: null, createdAt: new Date("2020-01-01T00:00:00Z"),
  };
  records.set(existing.id, existing);
  const otherIdentity: User = {
    id: "other-firebase-account", username: "claimed@example.test", password: "unusable-test-password",
    firebaseUid: "another-firebase-uid", createdAt: new Date("2021-01-01T00:00:00Z"),
  };
  records.set(otherIdentity.id, otherIdentity);
  let resolutionLock = Promise.resolve();
  const repository: AuthRepository = {
    getUserById: async id => records.get(id),
    getUserByFirebaseUid: async id => [...records.values()].find(user => user.firebaseUid === id),
    resolveFirebaseUser: async (firebaseUid, email, password) => {
      const previousResolution = resolutionLock;
      let releaseResolution!: () => void;
      resolutionLock = new Promise<void>(resolve => { releaseResolution = resolve; });
      await previousResolution;
      try {
        const linked = [...records.values()].find(user => user.firebaseUid === firebaseUid);
        if (linked) return linked;
        let user = [...records.values()].find(candidate => candidate.username === email);
        if (!user) {
          user = { id: `new-${records.size}`, username: email, password, firebaseUid: null, createdAt: new Date() };
          records.set(user.id, user);
        }
        if (user.firebaseUid && user.firebaseUid !== firebaseUid) return undefined;
        const updated = { ...user, firebaseUid };
        records.set(user.id, updated);
        return updated;
      } finally {
        releaseResolution();
      }
    },
  };
  const app = express();
  app.use(session({ secret: "isolated-session-test-secret", resave: false, saveUninitialized: false }));
  app.use(createFirebaseSessionRouter(repository, value => verifyFirebaseIdToken(value, jwks)));
  const server: Server = await new Promise(resolve => {
    const value = app.listen(0, "127.0.0.1", () => resolve(value));
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not open a port");
  return { url: `http://127.0.0.1:${address.port}`, records };
}

async function signIn(url: string, email: string) {
  return fetch(`${url}/auth/firebase-session`, {
    method: "POST", headers: { Authorization: `Bearer ${await token({ email })}` },
  });
}

describe("Firebase /auth/me restoration", () => {
  it("verifies the requested developer UID, links the account and restores its Premium session on reload", async () => {
    const { url, records } = await fixture();
    const response = await fetch(`${url}/auth/me`, { headers: { Authorization: `Bearer ${await token()}` } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "server-account", firebaseUid: uid, premium: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(records.get("server-account")?.firebaseUid).toBe(uid);
    expect(developerSubscription("server-account", uid)).toMatchObject({ tier: "premium", status: "active" });
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    const reload = await fetch(`${url}/auth/me`, { headers: { Cookie: cookie } });
    expect(reload.status).toBe(200);
    expect(await reload.json()).toMatchObject({ firebaseUid: uid, premium: true });
  });
  it("rejects forged, malformed and unverified tokens even for an allowlisted UID", async () => {
    const { url, records } = await fixture();
    for (const authorization of ["Bearer fake", `Basic ${await token()}`, `Bearer ${await token({ email_verified: false })}`]) {
      const response = await fetch(`${url}/auth/me`, { headers: { Authorization: authorization } });
      expect(response.status).toBe(401);
    }
    expect(records.get("server-account")?.firebaseUid).toBeNull();
  });
  it("does not grant Premium just because the Lumina account ID is allowlisted", async () => {
    const { url, records } = await fixture();
    const user = records.get("server-account")!;
    records.delete(user.id); records.set(uid, { ...user, id: uid });
    const ordinaryToken = await new SignJWT({ email: user.username, email_verified: true })
      .setSubject("ordinary-firebase-uid").setAudience("lumina-app-22fd7")
      .setIssuer("https://securetoken.google.com/lumina-app-22fd7").setExpirationTime("1h")
      .setProtectedHeader({ alg: "RS256" }).sign(keys.privateKey);
    const response = await fetch(`${url}/auth/me`, { headers: { Authorization: `Bearer ${ordinaryToken}` } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: uid, firebaseUid: "ordinary-firebase-uid", premium: null });
  });
  it("creates and persists a session for explicit Firebase redirect exchange", async () => {
    const { url } = await fixture();
    const response = await fetch(`${url}/auth/firebase-session`, {
      method: "POST", headers: { Authorization: `Bearer ${await token()}` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ firebaseUid: uid, premium: true });
    expect(response.headers.get("set-cookie")).toBeTruthy();
  });
  it("preserves a password session instead of linking leftover Firebase identity on passive reload", async () => {
    const { url, records } = await fixture();
    const first = await fetch(`${url}/auth/me`, { headers: { Authorization: `Bearer ${await token()}` } });
    const cookie = first.headers.get("set-cookie")!.split(";")[0];
    const user = records.get("server-account")!;
    records.set(user.id, { ...user, username: "local-writer", firebaseUid: null });
    const response = await fetch(`${url}/auth/me`, { headers: {
      Cookie: cookie, Authorization: `Bearer ${await token()}`, "X-Lumina-Preserve-Password-Session": "true",
    } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ username: "local-writer", firebaseUid: null, premium: null });
    expect(records.size).toBe(2);
  });
  it("requires authentication rather than accepting a client-supplied UID", async () => {
    const { url } = await fixture();
    expect((await fetch(`${url}/auth/me?uid=${uid}&premium=true`)).status).toBe(401);
  });
  it("cannot replace an existing Firebase link with an allowlisted UID", async () => {
    const { url, records } = await fixture();
    const original = records.get("server-account")!;
    records.set(original.id, { ...original, firebaseUid: "different-owner" });
    const response = await fetch(`${url}/auth/me`, { headers: { Authorization: `Bearer ${await token()}` } });
    expect(response.status).toBe(403);
    expect(records.get(original.id)?.firebaseUid).toBe("different-owner");
  });
  it("serializes concurrent first sign-ins and keeps the linked account when the verified email changes", async () => {
    const { url, records } = await fixture();
    const [first, concurrent] = await Promise.all([
      signIn(url, "first-snapshot@example.test"),
      signIn(url, "changed-snapshot@example.test"),
    ]);
    expect(first.status).toBe(200);
    expect(concurrent.status).toBe(200);
    const firstAccount = await first.json() as { id: string; firebaseUid: string };
    const concurrentAccount = await concurrent.json() as { id: string; firebaseUid: string };
    expect(concurrentAccount).toMatchObject({ id: firstAccount.id, firebaseUid: uid });

    // A later token with a changed, verified email must restore the UID link,
    // not attach the already-owned email account to this Firebase identity.
    const changedEmail = await signIn(url, "claimed@example.test");
    expect(changedEmail.status).toBe(200);
    expect(await changedEmail.json()).toMatchObject({ id: firstAccount.id, firebaseUid: uid });
    expect(records.get("other-firebase-account")?.firebaseUid).toBe("another-firebase-uid");
    expect([...records.values()].filter(user => user.firebaseUid === uid)).toHaveLength(1);
    expect(records.size).toBe(3);
  });
});
