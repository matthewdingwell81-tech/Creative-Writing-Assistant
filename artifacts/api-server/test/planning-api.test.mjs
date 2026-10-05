import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const origin = process.env.LUMINA_TEST_URL || "http://localhost:80";
function client() {
  let cookie = "";
  return async (path, method = "GET", body) => {
    const response = await fetch(`${origin}/api${path}`, {
      method,
      headers: { ...(cookie ? { Cookie: cookie } : {}), "Content-Type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) cookie = cookies.map(value => value.split(";")[0]).join("; ");
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : null };
  };
}

test("story planning persistence, ownership, links and deletion", async t => {
  const owner = client(), other = client(), anonymous = client();
  for (const api of [owner, other]) {
    const signup = await api("/auth/register", "POST", {
      username: `planning_test_${randomUUID().slice(0, 12)}`, password: randomUUID(),
    });
    assert.equal(signup.status, 201);
  }
  const docs = [];
  const document = async (api, title) => {
    const r = await api("/documents", "POST", { title, content: "<p>Manuscript unchanged.</p>", documentType: "fiction" });
    assert.equal(r.status, 201);
    docs.push({ api, id: r.data.id });
    return r.data.id;
  };
  const a = await document(owner, "Planning test A");
  const b = await document(owner, "Planning test B");
  const foreign = await document(other, "Planning test foreign");
  const path = `/documents/${a}/planning`;
  const make = async input => {
    const r = await owner(path, "POST", input);
    assert.equal(r.status, 201, JSON.stringify(r.data));
    return r.data;
  };
  try {
    await t.test("unauthenticated and cross-account access cannot read or mutate", async () => {
      assert.equal((await anonymous(path)).status, 401);
      for (const method of ["GET", "POST"]) {
        assert.equal((await other(path, method, method === "POST" ? { kind: "note", title: "Intrusion" } : undefined)).status, 404);
      }
      assert.equal((await owner("/documents/not-a-number/planning")).status, 400);
    });
    let hero, rival, relation, event1, event2, chapter;
    await t.test("create all types with persistent, complete output fields", async () => {
      chapter = (await owner(`/documents/${a}/chapters`, "POST", { title: "Linked chapter", position: 0 })).data;
      await owner(`/documents/${a}/chapters`, "POST", { title: "Keep chapter", position: 1 });
      hero = await make({ kind: "character", title: "Hero", motivations: "Save the town", traits: "Patient", arc: "Learns courage", content: "Detailed outline", chapterId: chapter.id });
      rival = await make({ kind: "character", title: "Rival", role: "Antagonist" });
      relation = await make({ kind: "relationship", title: "Siblings", characterId: hero.id, relatedCharacterId: rival.id, content: "Estranged" });
      event1 = await make({ kind: "timeline", title: "Arrival", timeLabel: "Day 1", characterId: hero.id, chapterId: chapter.id });
      event2 = await make({ kind: "timeline", title: "Reunion", timeLabel: "Day 2" });
      await make({ kind: "worldbuilding", title: "Mountain city", category: "Places", content: "Built of stone" });
      await make({ kind: "note", title: "Plot question", category: "Loose ends", content: "Why leave?" });
      const list = (await owner(path)).data;
      assert.equal(list.length, 7);
      assert.equal(list.find(r => r.id === hero.id).arc, "Learns courage");
      assert.equal(list.find(r => r.id === rival.id).content, "");
      assert.equal(list.find(r => r.id === rival.id).chapterId, null);
      assert.deepEqual((await owner(`/documents/${b}/planning`)).data, []);
      for (const r of list) { assert.equal(r.documentId, a); assert.ok(r.createdAt); assert.ok(r.updatedAt); }
    });
    await t.test("invalid fields, foreign chapter/character links and relationships are rejected", async () => {
      const foreignChapter = (await other(`/documents/${foreign}/chapters`, "POST", { title: "Foreign", position: 0 })).data;
      const foreignChar = (await other(`/documents/${foreign}/planning`, "POST", { kind: "character", title: "Foreign character" })).data;
      for (const input of [
        { kind: "note", title: " " },
        { kind: "note", title: "Bad link", chapterId: foreignChapter.id },
        { kind: "timeline", title: "Bad character", characterId: foreignChar.id },
        { kind: "relationship", title: "Missing endpoints" },
        { kind: "relationship", title: "Self", characterId: hero.id, relatedCharacterId: hero.id },
        { kind: "relationship", title: "Not a character", characterId: hero.id, relatedCharacterId: event1.id },
        { kind: "note", title: "Injected owner", documentId: b },
        { kind: "character", title: "Invalid nested character", characterId: hero.id },
      ]) assert.equal((await owner(path, "POST", input)).status, 400);
    });
    await t.test("updates can clear fields and links without altering manuscript or kind", async () => {
      const result = await owner(`${path}/${hero.id}`, "PATCH", { title: "Hero revised", traits: "", chapterId: null });
      assert.equal(result.status, 200);
      assert.equal(result.data.traits, "");
      assert.equal(result.data.chapterId, null);
      assert.equal(result.data.motivations, "Save the town");
      assert.equal((await owner(`${path}/${hero.id}`, "PATCH", { kind: "note" })).status, 400);
      assert.equal((await other(`${path}/${hero.id}`, "PATCH", { title: "Steal" })).status, 404);
      assert.equal((await other(`${path}/${hero.id}`, "DELETE")).status, 404);
      assert.equal((await owner(`/documents/${b}/planning/${hero.id}`, "PATCH", { title: "Wrong story" })).status, 404);
      assert.equal((await owner(`/documents/${b}/planning/${hero.id}`, "DELETE")).status, 404);
      assert.equal((await owner(`/documents/${a}`)).data.content, "<p>Manuscript unchanged.</p>");
    });
    await t.test("ordering is exhaustive, duplicate-free, scoped and durable", async () => {
      for (const ids of [[event1.id], [event1.id, event1.id], [event1.id, hero.id]]) {
        assert.equal((await owner(`${path}/order`, "PATCH", { kind: "timeline", ids })).status, 400);
      }
      assert.equal((await other(`${path}/order`, "PATCH", { kind: "timeline", ids: [event2.id, event1.id] })).status, 404);
      assert.equal((await owner(`${path}/order`, "PATCH", { kind: "timeline", ids: [event2.id, event1.id] })).status, 200);
      const events = (await owner(path)).data.filter(r => r.kind === "timeline");
      assert.deepEqual(events.map(r => r.id), [event2.id, event1.id]);
      assert.deepEqual(events.map(r => r.position), [0, 1]);
    });
    await t.test("deleting a chapter unlinks events rather than deleting them", async () => {
      assert.equal((await owner(`/chapters/${chapter.id}`, "DELETE")).status, 204);
      const event = (await owner(path)).data.find(r => r.id === event1.id);
      assert.ok(event);
      assert.equal(event.chapterId, null);
    });
    await t.test("deleting a character removes relationships and retains unlinked events", async () => {
      assert.equal((await owner(`${path}/${hero.id}`, "DELETE")).status, 204);
      const list = (await owner(path)).data;
      assert.ok(!list.some(r => r.id === hero.id || r.id === relation.id));
      assert.equal(list.find(r => r.id === event1.id).characterId, null);
      assert.ok(list.some(r => r.id === rival.id));
      assert.equal((await owner(`${path}/${hero.id}`, "DELETE")).status, 404);
    });
    await t.test("notes, worldbuilding and relationships can be edited and deleted", async () => {
      const relationship = await make({ kind: "relationship", title: "Allies", characterId: rival.id, relatedCharacterId: (await make({ kind: "character", title: "Mentor" })).id });
      const list = (await owner(path)).data;
      for (const record of [...list.filter(r => ["note", "worldbuilding"].includes(r.kind)), relationship]) {
        assert.equal((await owner(`${path}/${record.id}`, "PATCH", { title: `${record.title} edited`, content: "Revised" })).status, 200);
        assert.equal((await owner(`${path}/${record.id}`, "DELETE")).status, 204);
      }
    });
  } finally {
    for (const doc of docs) await doc.api(`/documents/${doc.id}`, "DELETE");
    assert.equal((await owner(path)).status, 404);
  }
});
