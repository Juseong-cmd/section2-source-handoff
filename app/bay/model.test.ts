import assert from "node:assert/strict";
import test from "node:test";
import { applyBayCommand, baseBay, effectiveBay, emptySchedule, parseBayCommand, type BayCommand } from "./model.ts";
import { initialData } from "../data.ts";
import { buildRecordOperations } from "../state-operations.ts";

const base: BayCommand = { kind: "base", memberId: "m1", actorId: "m2", revision: 0, requestId: "r1", month: "2026-09", bay: "Etch", reason: "월 배정" };
const apply = (c: BayCommand, state = emptySchedule("m1")) => applyBayCommand(state, c, [], "변경자", "담당자", "2026-09-28T00:00:00Z");

test("monthly base assignment and audit commit together without mutating input", () => {
  const before = emptySchedule("m1"); const next = apply(base, before);
  assert.equal(next.revision, 1); assert.equal(baseBay(next, "2026-09-29"), "Etch");
  assert.equal(baseBay(next, "2026-10-01"), ""); assert.deepEqual(before, emptySchedule("m1"));
  assert.equal(next.history[0].actorName, "변경자"); assert.equal(next.history[0].before, "미배정");
});

test("backup expires at end of period and reverts to each month's base", () => {
  const first = apply(base);
  const nextMonth = apply({ ...base, month: "2026-10", bay: "Fusion", revision: 1, requestId: "r2" }, first);
  const next = apply({ kind: "backup", memberId: "m1", actorId: "m2", revision: 2, requestId: "r3", start: "2026-09-29", end: "2026-10-02", bay: "Wet", reason: "지원" }, nextMonth);
  assert.equal(effectiveBay(next, "2026-09-28"), "Etch"); assert.equal(effectiveBay(next, "2026-10-01"), "Wet"); assert.equal(effectiveBay(next, "2026-10-03"), "Fusion");
  const cancelled = apply({ kind: "cancel", memberId: "m1", actorId: "m2", revision: 3, requestId: "r4", backupId: "r3", reason: "지원 취소" }, next);
  assert.equal(effectiveBay(cancelled, "2026-09-30"), "Etch"); assert.equal(cancelled.history.at(-1)?.action, "cancel"); assert.equal(cancelled.backups.length, 1);
});

test("stale revision rejects overlapping same-member changes, replay is idempotent", () => {
  const next = apply(base); assert.equal(apply(base, next), next);
  assert.throws(() => apply({ ...base, requestId: "competing", bay: "Wet" }, next), /다른 사용자/);
  assert.equal(apply({ ...base, memberId: "m2" }, emptySchedule("m2")).months["2026-09"], "Etch");
});

test("backups reject overlapping periods and absence, but allow flexible attendance", () => {
  const command: BayCommand = { kind: "backup", memberId: "m1", actorId: "m2", revision: 1, requestId: "b1", start: "2026-09-28", end: "2026-09-29", bay: "Wet", reason: "지원" };
  const first = apply(base), next = apply(command, first);
  assert.throws(() => apply({ ...command, requestId: "b2", revision: 2, start: "2026-09-29" }, next), /이미 백업/);
  const absence = { id: "a1", memberId: "m1", startDate: "2026-09-29", endDate: "2026-09-30", type: "annual" as const, label: "", memo: "" };
  assert.throws(() => applyBayCommand(first, command, [absence], "변경자", "담당자", "now"), /부재/);
  assert.throws(() => applyBayCommand(first, command, [{ ...absence, type: "flex" }], "변경자", "담당자", "now"), /지원 가능한 시간/);
  assert.equal(applyBayCommand(first, { ...command, acknowledgePartial: true }, [{ ...absence, type: "flex" }], "변경자", "담당자", "now").revision, 2);
});

test("carry preserves explicit empty months, backups, revisions and request idempotency", () => {
  const state = apply(base);
  const command: BayCommand = { kind: "carry", memberId: "m1", actorId: "m2", revision: 1, requestId: "carry", month: "2026-10", reason: "가져오기" };
  const next = apply(command, state);
  assert.equal(next.months["2026-10"], "Etch");
  assert.deepEqual(next.backups, state.backups);
  assert.equal(next.history.at(-1)?.action, "carry");
  assert.equal(apply(command, next), next);
  assert.throws(() => apply({ ...command, requestId: "another" }, next), /다른 사용자/);
  assert.throws(() => apply({ ...command, revision: 2, requestId: "overwrite" }, next), /덮어쓰지/);
  assert.throws(() => apply(command, { ...state, months: { ...state.months, "2026-10": "" } }), /덮어쓰지/);
  assert.throws(() => apply({ ...command, month: "2026-12" }, state), /지난달/);
});

test("date and command validation reject impossible dates, empty reason and unknown bays", () => {
  assert.ok(parseBayCommand(base));
  for (const patch of [{ bay: "Other" }, { month: "2026-13" }, { reason: " " }, { revision: -1 }, { actorId: "" }]) assert.equal(parseBayCommand({ ...base, ...patch }), null);
  assert.equal(parseBayCommand({ ...base, kind: "backup", start: "2026-02-30", end: "2026-03-01" }), null);
});

test("ordinary and old calendar saves cannot erase Bay records", () => {
  const next = apply(base);
  assert.deepEqual(buildRecordOperations({ ...initialData, baySchedules: [next] }, { ...initialData }), []);
});
