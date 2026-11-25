import assert from "node:assert/strict";
import test from "node:test";
import {
  DAILY_EXP_LIMIT,
  EXP_SYSTEM_VERSION,
  expRequiredForLevel,
  grantExp,
  normalizeExpProfile,
  requestedExp,
  totalExpRequiredForLevel,
  drawingBonus,
} from "./exp.ts";

test("drawing reward uses score thresholds without randomness", () => {
  assert.equal(requestedExp("drawing", 79), 5);
  assert.equal(requestedExp("drawing", 80), 7);
  assert.equal(requestedExp("drawing", 90), 8);
  assert.equal(drawingBonus(100), 3);
});

test("daily cap and level rollover are enforced immutably", () => {
  const profile = {
    memberId: "m1",
    characterId: "rabbit" as const,
    level: 19,
    exp: expRequiredForLevel(19) - 2,
    expVersion: EXP_SYSTEM_VERSION,
  };
  const daily = { memberId: "m1", date: "2026-09-10", amount: 12 };
  const result = grantExp(profile, daily, 8);

  assert.equal(result.granted, 3);
  assert.equal(result.profile.level, 20);
  assert.equal(result.profile.exp, 1);
  assert.equal(result.dailyRecord.amount, DAILY_EXP_LIMIT);
  assert.equal(profile.level, 19);
  assert.equal(daily.amount, 12);
});

test("existing level 40 milestone retains its cumulative EXP", () => {
  const required = totalExpRequiredForLevel(40);
  const monthsAtRegularPace = required / 7.5 / 21.75;

  assert.equal(required, 991);
  assert.ok(monthsAtRegularPace >= 6 && monthsAtRegularPace < 6.2);
});

test("legacy progress keeps its level and proportional progress", () => {
  const migrated = normalizeExpProfile({
    memberId: "m1",
    characterId: "rabbit",
    level: 12,
    exp: 50,
  });

  assert.equal(migrated.level, 12);
  assert.equal(migrated.exp, Math.floor(expRequiredForLevel(12) * 0.5));
  assert.equal(migrated.expVersion, EXP_SYSTEM_VERSION);
});

test("growth continues beyond level 40 while preserving the daily cap", () => {
  const result=grantExp({memberId:'m1',characterId:'rabbit',level:40,exp:28,expVersion:2},{memberId:'m1',date:'2026-11-19',amount:4},8);
  assert.equal(result.granted,8);assert.equal(result.profile.level,41);assert.equal(result.profile.exp,6);assert.equal(result.dailyRecord.amount,12);
  assert.equal(totalExpRequiredForLevel(100),991+60*30);
  assert.equal(normalizeExpProfile({memberId:'m1',characterId:'rabbit',level:100,exp:300,expVersion:3}).level,110);
});
test("version 2 progress and EXP totals survive migration",()=>{
 for(let level=1;level<=40;level++)for(let exp=0;exp<expRequiredForLevel(level);exp++) {
  const p=normalizeExpProfile({memberId:'m1',characterId:'rabbit',level,exp,expVersion:2});
  assert.equal(p.level,level);assert.equal(p.exp,exp);
 }
});
