// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import type { Server } from "node:http";
import type {} from "../../../api-server/src/types/session";
vi.mock("@replit/connectors-sdk", () => ({ ReplitConnectors: class {} }));
import { createBillingRouter } from "../../../api-server/src/routes/billing";
import type { User } from "../../../../lib/db/src/schema/users";
import type { SubscriptionState } from "@workspace/api-client-react";
const requireApi = createRequire(new URL("../../../api-server/package.json", import.meta.url));
const express = requireApi("express");
const servers: Server[] = [];
const user: User = {
  id: "lumina-account", firebaseUid: "firebase-uid", username: "writer@example.test",
  password: "not-used", tutorialsEnabled: true, createdAt: new Date(),
};
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.close(() => resolve()); server.closeAllConnections();
  })));
});
async function fixture() {
  vi.stubEnv("REVENUECAT_WEBHOOK_AUTHORIZATION", "isolated-webhook-secret");
  let current: SubscriptionState = {
    accountId: user.id, tier: "premium", status: "active", subscriptionId: "subscription",
    expiresAt: Date.now() + 86400000, verifiedAt: Date.now(), receipt: "signed-test",
    firebaseSync: "synced",
  };
  const verifiedState = vi.fn(async () => ({ ...current }));
  const deliver = vi.fn().mockResolvedValue("already-sent");
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: () => void) => {
    req.log = { warn: vi.fn() }; req.session = {}; next();
  });
  app.use(createBillingRouter({
    getUserById: async id => id === user.id ? user : undefined,
    getUserByFirebaseUid: async uid => uid === user.firebaseUid ? user : undefined,
    verifiedState, deliverPremiumAccessEmail: deliver,
  }));
  const server: Server = await new Promise(resolve => {
    const value = app.listen(0, "127.0.0.1", () => resolve(value));
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server unavailable");
  const post = (event: Record<string, unknown>, authorization = "isolated-webhook-secret") =>
    fetch(`http://127.0.0.1:${address.port}/billing/webhook`, {
      method: "POST", headers: { authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ event: { id: "event", type: "INITIAL_PURCHASE", app_user_id: "lumina:firebase-uid", ...event } }),
    });
  return { post, verifiedState, deliver, setState: (next: Partial<SubscriptionState>) => { current = { ...current, ...next }; } };
}
describe("RevenueCat webhook authentication, identity, and retries", () => {
  it("rejects unauthorized or malformed delivery before reading billing state", async () => {
    const f = await fixture();
    expect((await f.post({}, "wrong-secret")).status).toBe(401);
    expect((await f.post({ id: "" })).status).toBe(400);
    expect((await f.post({ transferred_from: [123] })).status).toBe(400);
    expect((await f.post({ transferred_to: "not-an-array" })).status).toBe(400);
    expect(f.verifiedState).not.toHaveBeenCalled();
  });
  it("resolves Firebase and legacy customer IDs to the same account once per transfer", async () => {
    const f = await fixture();
    expect((await f.post({ transferred_from: ["lumina:lumina-account"], transferred_to: ["lumina:firebase-uid"] })).status).toBe(204);
    expect(f.verifiedState).toHaveBeenCalledExactlyOnceWith(user.id);
    expect((await f.post({ app_user_id: "lumina:unrelated-account" })).status).toBe(204);
    expect(f.verifiedState).toHaveBeenCalledTimes(1);
  });
  it("rechecks provider state for duplicate and out-of-order events rather than applying event claims", async () => {
    const f = await fixture();
    expect((await f.post({})).status).toBe(204);
    expect((await f.post({})).status).toBe(204);
    f.setState({ tier: "free", status: "expired" });
    expect((await f.post({ id: "late-old-renewal", type: "RENEWAL", tier: "premium" })).status).toBe(204);
    expect(f.verifiedState).toHaveBeenCalledTimes(3);
    expect(f.deliver).toHaveBeenCalledTimes(2); // no email/grant for the expired state
  });
  it("requests retry when cloud sync or email delivery is unavailable", async () => {
    const f = await fixture();
    f.setState({ firebaseSync: "unavailable" });
    expect((await f.post({})).status).toBe(503);
    f.setState({ firebaseSync: "synced" });
    f.deliver.mockRejectedValueOnce(new Error("temporary email error"));
    expect((await f.post({})).status).toBe(503);
    expect((await f.post({})).status).toBe(204);
  });
});
