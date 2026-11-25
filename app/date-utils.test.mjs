import assert from "node:assert/strict";
import {
  getKstDateParts,
  millisecondsUntilNextKstDate,
  todayIsoKst,
  weekdayFromIso,
} from "./date-utils-testable.mjs";

assert.equal(todayIsoKst(new Date("2026-06-16T14:59:00.000Z")), "2026-06-16");
assert.equal(todayIsoKst(new Date("2026-06-16T15:00:00.000Z")), "2026-06-17");
assert.deepEqual(getKstDateParts(new Date("2026-06-16T15:00:00.000Z")), {
  year: 2026,
  month: 5,
  day: 17,
});
assert.equal(weekdayFromIso("2026-06-17"), 3);
assert.equal(millisecondsUntilNextKstDate(new Date("2026-06-16T14:59:30.000Z")), 30_000);
assert.equal(millisecondsUntilNextKstDate(new Date("2026-06-16T15:00:00.000Z")), 86_400_000);

console.log("date-utils tests passed");
