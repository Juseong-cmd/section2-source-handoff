import {
  getKstDateParts as getKstDatePartsValue,
  isoFromParts as isoFromPartsValue,
  isoParts as isoPartsValue,
  millisecondsUntilNextKstDate as millisecondsUntilNextKstDateValue,
  todayIsoKst as todayIsoKstValue,
  weekdayFromIso as weekdayFromIsoValue,
} from "./date-utils-testable.mjs";

export type KstDateParts = {
  year: number;
  month: number;
  day: number;
};

export function getKstDateParts(date = new Date()): KstDateParts {
  return getKstDatePartsValue(date) as KstDateParts;
}

export function isoFromParts(year: number, month: number, day: number): string {
  return isoFromPartsValue(year, month, day) as string;
}

export function todayIsoKst(date = new Date()): string {
  return todayIsoKstValue(date) as string;
}

export function isoParts(iso: string): KstDateParts {
  return isoPartsValue(iso) as KstDateParts;
}

export function weekdayFromIso(iso: string): number {
  return weekdayFromIsoValue(iso) as number;
}

export function millisecondsUntilNextKstDate(date = new Date()): number {
  return millisecondsUntilNextKstDateValue(date) as number;
}
