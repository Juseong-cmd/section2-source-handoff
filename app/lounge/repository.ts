import { appStoragePrefix } from "../site-config";
import type { CharacterProfile, DailyExpRecord, LoungeState } from "./types";

const storageKey = `${appStoragePrefix}-lounge-v1`;
const emptyState: LoungeState = { profiles: {}, dailyExp: {} };

export interface LoungeRepository {
  getProfile(memberId: string): CharacterProfile | null;
  saveProfile(profile: CharacterProfile): void;
  getDailyExp(memberId: string, date: string): DailyExpRecord;
  saveDailyExp(record: DailyExpRecord): void;
}

function readState(): LoungeState {
  if (typeof window === "undefined") return emptyState;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "{}") as Partial<LoungeState>;
    return {
      profiles: parsed.profiles ?? {},
      dailyExp: parsed.dailyExp ?? {},
    };
  } catch {
    return emptyState;
  }
}

function writeState(state: LoungeState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(state));
}

function dailyKey(memberId: string, date: string) {
  return `${memberId}:${date}`;
}

export const localLoungeRepository: LoungeRepository = {
  getProfile(memberId) {
    return readState().profiles[memberId] ?? null;
  },
  saveProfile(profile) {
    const current = readState();
    writeState({
      ...current,
      profiles: { ...current.profiles, [profile.memberId]: profile },
    });
  },
  getDailyExp(memberId, date) {
    return readState().dailyExp[dailyKey(memberId, date)] ?? { memberId, date, amount: 0 };
  },
  saveDailyExp(record) {
    const current = readState();
    writeState({
      ...current,
      dailyExp: { ...current.dailyExp, [dailyKey(record.memberId, record.date)]: record },
    });
  },
};
