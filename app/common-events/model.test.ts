import assert from "node:assert/strict";
import test from "node:test";
import { parseEventCommand, eventTimeLabel, eventOccursOn, eventDateLabel, saveEvent, respondToEvent, responseCounts, replyState, type EventCommand } from "./model.ts";
import { initialData } from "../data.ts";
import { buildRecordOperations } from "../state-operations.ts";

const members = ["m0", "m1", "m2"].map(id => ({ id, name: id, active: true, color: "#1428a0" }));
const at = "2026-09-29T01:00:00Z";
const create: Extract<EventCommand, { kind: "save" }> = { kind: "save", actorId: "m0", eventId: "event-1", revision: 0, requestId: "create-1", fields: { title: "회의", kind: "meeting", meal: "lunch", date: "2026-09-29", start: "14:00", end: "15:00", notes: "", location: "A", deadline: "2026-09-29T12:00", responseMode: "confirm", targetIds: ["m0", "m1"] } };
const response: Extract<EventCommand, { kind: "respond" }> = { kind: "respond", actorId: "m1", eventId: "event-1", revision: 0, requestId: "reply-1", eventRevision: 1, status: "confirmed" };
const event = () => saveEvent(null, create, members, members[0], at);

test("events snapshot targets and start unanswered; extra members do not change denominator", () => {
  const e = event(); assert.deepEqual(e.targets, members.slice(0, 2).map(({ id, name }) => ({ id, name })));
  assert.equal(responseCounts(e, []).unanswered, 2); assert.equal(e.history.length, 1);
});
test("only creator edits and only targeted users respond", () => {
  const e = event();
  assert.throws(() => saveEvent(e, { ...create, actorId: "m1", revision: 1, requestId: "edit" }, members, members[1], at), /등록자/);
  assert.throws(() => respondToEvent(e, null, { ...response, actorId: "m2" }, members[2], at), /대상자/);
  assert.throws(() => respondToEvent(e, null, { ...response, status: "attending" }, members[1], at), /응답 방식/);
});
test("idempotent retries and unchanged responses add no duplicate history", () => {
  const e = event(); assert.equal(saveEvent(e, create, members, members[0], at), e);
  const r = respondToEvent(e, null, response, members[1], at);
  assert.equal(respondToEvent(e, r, response, members[1], at), r);
  assert.equal(respondToEvent(e, r, { ...response, revision: 1, requestId: "again" }, members[1], at), r);
});
test("edits preserve prior response but require reconfirmation and reject stale submissions", () => {
  const e = event(), r = respondToEvent(e, null, response, members[1], at);
  const edited = saveEvent(e, { ...create, revision: 1, requestId: "edit", fields: { ...create.fields, location: "B" } }, members, members[0], at);
  assert.equal(replyState(edited, r), "재확인 필요"); assert.equal(responseCounts(edited, [r]).confirmed, 0);
  assert.throws(() => respondToEvent(edited, r, { ...response, revision: 1, requestId: "old-version" }, members[1], at), /변경/);
  const confirmed = respondToEvent(edited, r, { ...response, revision: 1, eventRevision: 2, requestId: "reconfirmed" }, members[1], at);
  assert.equal(confirmed.history.length, 2); assert.equal(replyState(edited, confirmed), "확인 완료");
  assert.equal(r.history.length, 1);
});
test("cancel preserves event and audit but blocks replies and edits", () => {
  const e = event(); const cancelled = saveEvent(e, { kind: "cancel", eventId: e.id, actorId: "m0", revision: 1, requestId: "cancel", reason: "회의 연기" }, members, members[0], at);
  assert.equal(cancelled.history.at(-1)?.reason, "회의 연기"); assert.equal(cancelled.cancelled, true);
  assert.throws(() => respondToEvent(cancelled, null, { ...response, eventRevision: 2 }, members[1], at), /취소/);
});
test("invalid intervals, dates, duplicate targets and late deadlines are rejected", () => {
  assert.ok(parseEventCommand(create));
  for (const fields of [{ date: "2026-02-30" }, { start: "25:00" }, { end: "13:00" }, { title: " " }, { targetIds: [] }, { targetIds: ["m1", "m1"] }, { deadline: "2026-09-29T16:00" }]) assert.equal(parseEventCommand({ ...create, fields: { ...create.fields, ...fields } }), null);
});
test("legacy calendar writes cannot delete common event records", () => {
  const e = event(); const r = respondToEvent(e, null, response, members[1], at);
  assert.deepEqual(buildRecordOperations({ ...initialData, commonEvents: [e], commonResponses: [r] }, initialData), []);
});

test("date ranges include both boundaries and legacy events remain single-day", () => {
  const legacy = event();
  assert.equal(eventOccursOn(legacy, "2026-09-29"), true);
  assert.equal(eventOccursOn(legacy, "2026-09-30"), false);
  const command = parseEventCommand({ ...create, fields: { ...create.fields, endDate: "2026-10-02" } });
  assert.ok(command && command.kind === "save");
  const range = saveEvent(null, command, members, members[0], at);
  for (const date of ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]) assert.equal(eventOccursOn(range, date), true);
  for (const date of ["2026-09-28", "2026-10-03"]) assert.equal(eventOccursOn(range, date), false);
  assert.equal(eventDateLabel(range), "2026-09-29 ~ 2026-10-02");
  const edited = saveEvent(range, { ...command, revision: 1, requestId: "shorten", fields: { ...command.fields, endDate: "2026-09-30" } }, members, members[0], at);
  assert.equal(edited.history.at(-1)?.before?.endDate, "2026-10-02");
  assert.equal(edited.history.at(-1)?.after.endDate, "2026-09-30");
  assert.equal(eventOccursOn(edited, "2026-10-01"), false);
});
test("range validation rejects reversed and malformed end dates", () => {
  for (const endDate of ["2026-09-28", "2026-02-30", "", null, 123]) assert.equal(parseEventCommand({ ...create, fields: { ...create.fields, endDate } }), null);
  const legacy = parseEventCommand(create);
  assert.ok(legacy && legacy.kind === "save");
  assert.equal(legacy.fields.endDate, legacy.fields.date);
});

test("all-day events omit times and retain the flag in edit history", () => {
  const command = parseEventCommand({ ...create, fields: { ...create.fields, allDay: true, start: "", end: "", deadline: "" } });
  assert.ok(command && command.kind === "save");
  const saved = saveEvent(null, command, members, members[0], at);
  assert.equal(saved.allDay, true); assert.equal(saved.start, ""); assert.equal(saved.end, "");
  assert.equal(eventTimeLabel(saved), "전일");
  const timed = saveEvent(saved, { ...create, revision: 1, requestId: "timed", fields: { ...create.fields, allDay: false } }, members, members[0], at);
  assert.equal(timed.history.at(-1)?.before?.allDay, true);
  assert.equal(eventTimeLabel(timed), "14:00–15:00");
  assert.equal(parseEventCommand({ ...create, fields: { ...create.fields, allDay: false, start: "", end: "" } }), null);
  assert.equal(parseEventCommand({ ...create, fields: { ...create.fields, allDay: "true" } }), null);
});
