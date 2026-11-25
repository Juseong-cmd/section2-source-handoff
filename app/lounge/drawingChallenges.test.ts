import assert from "node:assert/strict";
import test from "node:test";
import { getDailyDrawingChallenge } from "./drawingChallenges.ts";
import { drawingExamples } from "./drawingCatalog.ts";
import { existsSync } from "node:fs";

test("daily challenge is stable for a date and changes the next day", () => {
  const today = getDailyDrawingChallenge("2026-09-10");
  const repeated = getDailyDrawingChallenge("2026-09-10");
  const tomorrow = getDailyDrawingChallenge("2026-09-11");
  assert.equal(today.id, repeated.id);
  assert.notEqual(today.id, tomorrow.id);
});

test("100 unique examples, 40 easy / 40 medium / 20 challenge, all files present", () => {
  assert.equal(drawingExamples.length, 100);
  assert.equal(new Set(drawingExamples.map(x => x.id)).size, 100);
  assert.deepEqual(["쉬움", "보통", "도전"].map(level => drawingExamples.filter(x => x.difficulty === level).length), [40, 40, 20]);
  for (const example of drawingExamples) assert.ok(existsSync(`public${example.asset}`));
});

test("each cycle contains all 100 examples, stable across refresh, no boundary repeats", () => {
  let previous = "";
  for (let cycle = 0; cycle < 20; cycle++) {
    const ids = new Set<string>();
    for (let day = 0; day < 100; day++) {
      const date = new Date(Date.UTC(2026, 10, 3 + cycle * 100 + day)).toISOString().slice(0, 10);
      const current = getDailyDrawingChallenge(date);
      assert.equal(current.id, getDailyDrawingChallenge(date).id);
      assert.notEqual(previous, current.id);
      ids.add(current.id);
      previous = current.id;
    }
    assert.equal(ids.size, 100);
  }
});

test("release-day submissions keep original example until next KST day", () => {
  assert.equal(getDailyDrawingChallenge("2026-11-02").tile, undefined);
  assert.equal(typeof getDailyDrawingChallenge("2026-11-03").tile, "number");
});
