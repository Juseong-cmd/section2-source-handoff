import assert from "node:assert/strict";
import { test } from "node:test";
import { datesBetween, getHolidayName, getPublicHolidayName } from "./calendar-holidays.ts";

test("2027 official calendar has all 24 named public holiday dates", () => {
  const expected = [
    "01-01", "02-06", "02-07", "02-08", "02-09", "03-01", "05-01", "05-03", "05-05", "05-13", "06-06",
    "07-17", "07-19", "08-15", "08-16", "09-14", "09-15", "09-16", "10-03", "10-04", "10-09", "10-11", "12-25", "12-27",
  ];
  assert.deepEqual(datesBetween("2027-01-01", "2027-12-31", true).filter(getPublicHolidayName), expected.map(date => `2027-${date}`));
  assert.equal(getPublicHolidayName("2027-02-07"), "설날");
  assert.equal(getPublicHolidayName("2027-02-09"), "설날 대체");
});

test("2028 preview preserves the election and overlapping Chuseok and National Foundation Day", () => {
  const expected = [
    "01-01", "01-26", "01-27", "01-28", "03-01", "04-12", "05-01", "05-02", "05-05", "06-06",
    "07-17", "08-15", "10-02", "10-03", "10-04", "10-05", "10-09", "12-25",
  ];
  assert.deepEqual(datesBetween("2028-01-01", "2028-12-31", true).filter(getPublicHolidayName), expected.map(date => `2028-${date}`));
  assert.equal(getPublicHolidayName("2028-10-03"), "추석 · 개천절");
  assert.equal(getPublicHolidayName("2028-01-03"), null);
});

test("overtime ranges exclude public holidays and retain the existing Family Day rule", () => {
  assert.deepEqual(datesBetween("2027-02-06", "2027-02-10", false), ["2027-02-10"]);
  assert.deepEqual(datesBetween("2028-10-02", "2028-10-06", false), ["2028-10-06"]);
  assert.equal(datesBetween("2027-02-06", "2027-02-09", true).length, 4);
  assert.equal(getHolidayName(new Date(2027, 1, 19)), "패밀리데이");
  assert.deepEqual(datesBetween("2027-02-19", "2027-02-19", false), []);
  assert.equal(getPublicHolidayName("2026-09-27"), null);
  assert.equal(getPublicHolidayName("2026-07-17"), "제헌절");
  assert.equal(getPublicHolidayName("2025-07-17"), null);
});
