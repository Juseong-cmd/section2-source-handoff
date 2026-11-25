import { weekdayFromIso } from "./date-utils.ts";

const fixedHolidays: Record<string, string> = {
  "01-01": "신정",
  "03-01": "삼일절",
  "05-01": "근로자의날",
  "05-05": "어린이날",
  "06-06": "현충일",
  "08-15": "광복절",
  "10-03": "개천절",
  "10-09": "한글날",
  "12-25": "성탄절",
};

const datedHolidays: Record<string, string> = {
  // 2026 월력요항 및 제헌절 공휴일 복원
  "2026-02-16": "설 연휴",
  "2026-02-17": "설날",
  "2026-02-18": "설 연휴",
  "2026-03-02": "삼일절 대체",
  "2026-05-24": "부처님오신날",
  "2026-05-25": "부처님오신날 대체",
  "2026-06-03": "지방선거",
  "2026-08-17": "광복절 대체",
  "2026-09-24": "추석 연휴",
  "2026-09-25": "추석",
  "2026-09-26": "추석 연휴",
  "2026-10-05": "개천절 대체",

  // 우주항공청 2027년 월력요항 공고 제2026-0078호
  "2027-02-06": "설 연휴",
  "2027-02-07": "설날",
  "2027-02-08": "설 연휴",
  "2027-02-09": "설날 대체",
  "2027-05-03": "노동절 대체",
  "2027-05-13": "부처님오신날",
  "2027-07-19": "제헌절 대체",
  "2027-08-16": "광복절 대체",
  "2027-09-14": "추석 연휴",
  "2027-09-15": "추석",
  "2027-09-16": "추석 연휴",
  "2027-10-04": "개천절 대체",
  "2027-10-11": "한글날 대체",
  "2027-12-27": "성탄절 대체",

  // 한국천문연구원 2028년 달력자료(잠정)
  "2028-01-26": "설 연휴",
  "2028-01-27": "설날",
  "2028-01-28": "설 연휴",
  "2028-04-12": "국회의원선거",
  "2028-05-02": "부처님오신날",
  "2028-10-02": "추석 연휴",
  "2028-10-03": "추석 · 개천절",
  "2028-10-04": "추석 연휴",
  "2028-10-05": "대체공휴일",
};

export function getPublicHolidayName(iso: string): string | null {
  const monthDay = iso.slice(5);
  if (iso >= "2026-05-01" && monthDay === "05-01") return "노동절";
  if (iso >= "2026-07-17" && monthDay === "07-17") return "제헌절";
  return datedHolidays[iso] ?? fixedHolidays[monthDay] ?? null;
}

export function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getFamilyDayIso(year: number, month: number) {
  const date = new Date(year, month, 21);
  const weekday = weekdayFromIso(toIso(date));
  const offset = weekday === 0 ? -2 : weekday === 6 ? -1 : 5 - weekday;
  date.setDate(date.getDate() + offset);
  return toIso(date);
}

export function getHolidayName(date: Date): string | null {
  const iso = toIso(date);
  return getPublicHolidayName(iso) ?? (getFamilyDayIso(date.getFullYear(), date.getMonth()) === iso ? "패밀리데이" : null);
}

export function datesBetween(start: string, end: string, includeWeekendHoliday: boolean): string[] {
  const result: string[] = [];
  const cursor = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cursor <= last) {
    const weekday = cursor.getDay();
    if (includeWeekendHoliday || (weekday !== 0 && weekday !== 6 && !getHolidayName(cursor))) {
      result.push(toIso(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}
