import assert from "node:assert/strict";
import { startVisiblePolling } from "../app/visible-polling.ts";

const clock = new EventTarget();
const page = new EventTarget();
page.hidden = false;
let now = 0, serial = 0;
const timers = new Map();
clock.setInterval = (run, period) => {
  timers.set(++serial, {run, period, next:now+period});
  return serial;
};
clock.clearInterval = id => timers.delete(id);
globalThis.window = clock;
globalThis.document = page;
Date.now = () => now;
function advance(duration) {
  for (let remaining = duration; remaining > 0; remaining -= 1000) {
    now += 1000;
    for (const timer of timers.values()) if (timer.next === now) {
      timer.next += timer.period;
      timer.run();
    }
  }
}
function visible(value) {
  page.hidden = !value;
  page.dispatchEvent(new Event("visibilitychange"));
}
const counts = [0,0,0];
const tearDown = [30_000,60_000,60_000].map((period,i) => startVisiblePolling(() => counts[i]++,period));
advance(3_600_000);
assert.deepEqual(counts,[121,61,61]);
visible(false);
advance(3_600_000);
clock.dispatchEvent(new Event("focus"));
assert.deepEqual(counts,[121,61,61]);
visible(true);
clock.dispatchEvent(new Event("focus"));
assert.deepEqual(counts,[122,62,62]);
tearDown.forEach(stop=>stop());
advance(3_600_000);
assert.deepEqual(counts,[122,62,62]);
console.log("PASS visible one-hour intervals, no hidden polling, foreground refresh without duplicates, cleanup");
