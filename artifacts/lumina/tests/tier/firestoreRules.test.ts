// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// Source-contract regression only. Actual enforcement still requires the Firebase
// rules emulator and deployment of these rules to the existing Firebase project.
describe("Firestore owner-read-only rules source", () => {
  it("denies all client entitlement writes and cross-user/list reads", () => {
    const rules = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
    expect(rules).toContain("request.auth != null && request.auth.uid == uid");
    expect(rules).toContain("allow get: if owner();");
    expect(rules).toContain("allow list: if false;");
    expect(rules).toContain("allow create, update, delete: if false;");
    expect(rules).not.toMatch(/allow\s+(?:read|write)\s*:/);
    expect((rules.match(/match\s+\//g) ?? []).length).toBe(2);
  });
});
