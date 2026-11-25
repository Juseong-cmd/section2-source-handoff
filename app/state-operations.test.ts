import assert from "node:assert/strict";
import test from "node:test";
import { initialData, type AppData } from "./data.ts";
import { applyRecordOperations, buildRecordOperations, rebaseRecordOperations, recordIdentity, sameRecordValue, containsRecordChanges } from "./state-operations.ts";

function emptyData(): AppData {
  return { ...initialData };
}

test("character EXP records use stable member and date identities", () => {
  assert.equal(recordIdentity("characterProfiles", { memberId: "m1" }), "m1");
  assert.equal(recordIdentity("dailyCharacterExp", { memberId: "m1", date: "2026-09-11" }), "m1|2026-09-11");
  assert.equal(recordIdentity("drawingSubmissions", { memberId: "m1", date: "2026-09-11" }), "m1");
});

test("independent member profile updates merge without dropping either member", () => {
  const base = emptyData();
  const first: AppData = {
    ...base,
    characterProfiles: [{ memberId: "m1", characterId: "rabbit", level: 2, exp: 4, expVersion: 2 }],
  };
  const second: AppData = {
    ...base,
    characterProfiles: [{ memberId: "m2", characterId: "fox", level: 3, exp: 7, expVersion: 2 }],
  };

  const afterFirst = applyRecordOperations(base, buildRecordOperations(base, first));
  const merged = applyRecordOperations(afterFirst, buildRecordOperations(base, second));

  assert.deepEqual(merged.characterProfiles.map((profile) => profile.memberId).sort(), ["m1", "m2"]);
});

test("concurrent changes to different fields on one member are preserved", () => {
  const base: AppData = {
    ...emptyData(),
    members: [{ id: "m1", name: "체리", color: "#111111", active: true }],
  };
  const latest: AppData = {
    ...base,
    members: [{ ...base.members[0]!, color: "#222222" }],
  };
  const incoming: AppData = {
    ...base,
    members: [{ ...base.members[0]!, active: false }],
  };

  const rebased = rebaseRecordOperations(latest, buildRecordOperations(base, incoming));

  assert.deepEqual(rebased.members[0], { id: "m1", name: "체리", color: "#222222", active: false });
});

test("the latest request wins only the overlapping field", () => {
  const base: AppData = {
    ...emptyData(),
    members: [{ id: "m1", name: "기존", color: "#111111", active: true }],
  };
  const latest: AppData = {
    ...base,
    members: [{ ...base.members[0]!, name: "먼저 저장", color: "#222222" }],
  };
  const incoming: AppData = {
    ...base,
    members: [{ ...base.members[0]!, name: "나중 저장" }],
  };

  const rebased = rebaseRecordOperations(latest, buildRecordOperations(base, incoming));

  assert.deepEqual(rebased.members[0], { id: "m1", name: "나중 저장", color: "#222222", active: true });
});

test("a stale character profile creation preserves the existing progress", () => {
  const latest: AppData = {
    ...emptyData(),
    characterProfiles: [{ memberId: "m1", characterId: "rabbit", level: 4, exp: 9, expVersion: 2 }],
  };
  const staleSelection: AppData = {
    ...emptyData(),
    characterProfiles: [{ memberId: "m1", characterId: "cat_orange", level: 1, exp: 0, expVersion: 2 }],
  };

  const rebased = rebaseRecordOperations(latest, buildRecordOperations(emptyData(), staleSelection));

  assert.deepEqual(rebased.characterProfiles[0], {
    memberId: "m1",
    characterId: "cat_orange",
    level: 4,
    exp: 9,
    expVersion: 2,
  });
});

test("display truncation never deletes server audit history", () => {
  const base = { ...emptyData(), auditLogs: Array.from({length: 80}, (_, i) => ({id: `log-${i}`, at: "2026-11-03T00:00:00Z", actor: "test", action: "test"})) };
  const next = { ...base, auditLogs: [{id: "new", at: "2026-11-03T01:00:00Z", actor: "test", action: "test"}, ...base.auditLogs].slice(0, 80) };
  const operations = buildRecordOperations(base, next);
  assert.equal(operations.length, 1); assert.equal(operations[0].id, "new");
});
test("JSONB key order does not create spurious record changes", () => {
  assert.equal(sameRecordValue({a: 1, b: {x: 2, y: 3}}, {b: {y: 3, x: 2}, a: 1}), true);
});
test("strict retry preserves independent edits and rejects overlapping edits", () => {
  const base = {...emptyData(), members: [{id: "m1", name: "A", color: "red", active: true}]};
  const incoming = {...base, members: [{...base.members[0], name: "B"}]};
  const operations = buildRecordOperations(base, incoming);
  const latest = {...base, members: [{...base.members[0], color: "blue"}]};
  assert.equal(rebaseRecordOperations(latest, operations, true).members[0].color, "blue");
  assert.throws(() => rebaseRecordOperations({...latest, members: [{...latest.members[0], name: "C"}]}, operations, true));
  assert.equal(rebaseRecordOperations(incoming, operations, true).members[0].name, "B");
});
test("audit log existence alone cannot acknowledge a pending business change", () => {
  const base = {...emptyData(), members: [{id: "m1", name: "A", color: "red", active: true}]};
  const log = {id: "done", at: "2026-11-03T01:00:00Z", actor: "test", action: "test"};
  const pending = {...base, members: [{...base.members[0], name: "B"}], auditLogs: [log]};
  assert.equal(containsRecordChanges({...base, auditLogs: [log]}, pending, base), false);
  assert.equal(containsRecordChanges(pending, pending, base), true);
});
