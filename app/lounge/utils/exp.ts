import type { CharacterProfile, DailyExpRecord, ExpActivity } from "../types";

export const DAILY_EXP_LIMIT = 15;
export const EXP_SYSTEM_VERSION = 3;
const LEGACY_EXP_PER_LEVEL = 100;
const BASE_EXP_PER_LEVEL = 22;
const LEVEL_BAND_SIZE = 5;

const activityRewards: Record<ExpActivity, number> = {
  schedule: 2,
  attendance: 2,
  drawing: 5,
};

export function drawingBonus(score: number) {
  if (score >= 90) return 3;
  if (score >= 80) return 2;
  return 0;
}

export function requestedExp(activity: ExpActivity, score?: number) {
  return activityRewards[activity] + (activity === "drawing" ? drawingBonus(score ?? 0) : 0);
}

export function expRequiredForLevel(level: number) {
  const normalizedLevel = Math.max(1, Math.floor(Number.isFinite(level) ? level : 1));
  return normalizedLevel >= 40 ? 30 : BASE_EXP_PER_LEVEL + Math.floor((normalizedLevel - 1) / LEVEL_BAND_SIZE);
}

export function totalExpRequiredForLevel(targetLevel: number) {
  const target = Math.max(1, Math.floor(Number.isFinite(targetLevel) ? targetLevel : 1));
  let total = 0;
  for (let level = 1; level < Math.min(target, 40); level++) total += expRequiredForLevel(level);
  return total + Math.max(0, target - 40) * 30;
}

export function expRemainingToLevel(profile: CharacterProfile, targetLevel: number) {
  const normalized = normalizeExpProfile(profile);
  return Math.max(0, totalExpRequiredForLevel(targetLevel) - totalExpRequiredForLevel(normalized.level) - normalized.exp);
}

export function normalizeExpProfile(profile: CharacterProfile): CharacterProfile {
  let level = Math.max(1, Math.floor(Number.isFinite(profile.level) ? profile.level : 1));
  let exp = (profile.expVersion ?? 1) >= 2
    ? Math.max(0, Math.floor(Number.isFinite(profile.exp) ? profile.exp : 0))
    : Math.floor(
        (Math.max(0, Math.min(LEGACY_EXP_PER_LEVEL - 1, profile.exp || 0)) / LEGACY_EXP_PER_LEVEL)
        * expRequiredForLevel(level),
      );

  while (level < 40 && exp >= expRequiredForLevel(level)) {
    exp -= expRequiredForLevel(level);
    level += 1;
  }

  if (level >= 40) { level += Math.floor(exp / 30); exp %= 30; }

  return {
    ...profile,
    level,
    exp,
    expVersion: EXP_SYSTEM_VERSION,
  };
}

export function grantExp(
  profile: CharacterProfile,
  dailyRecord: DailyExpRecord,
  request: number,
): { profile: CharacterProfile; dailyRecord: DailyExpRecord; granted: number } {
  const normalizedProfile = normalizeExpProfile(profile);
  const remainingDailyExp = Math.max(0, DAILY_EXP_LIMIT - dailyRecord.amount);
  const granted = Math.max(0, Math.min(Number.isFinite(request) ? request : 0, remainingDailyExp));
  let level = normalizedProfile.level;
  let exp = normalizedProfile.exp + granted;

  while (level < 40 && exp >= expRequiredForLevel(level)) {
    exp -= expRequiredForLevel(level);
    level += 1;
  }

  if (level >= 40) { level += Math.floor(exp / 30); exp %= 30; }

  return {
    profile: {
      ...normalizedProfile,
      level,
      exp,
      expVersion: EXP_SYSTEM_VERSION,
    },
    dailyRecord: {
      ...dailyRecord,
      amount: dailyRecord.amount + granted,
    },
    granted,
  };
}
