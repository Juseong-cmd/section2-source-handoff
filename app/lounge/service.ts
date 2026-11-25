import { todayIsoKst } from "../date-utils";
import { localLoungeRepository, type LoungeRepository } from "./repository";
import type { CharacterId, CharacterProfile, CharacterReactionKind, ExpActivity } from "./types";
import { EXP_SYSTEM_VERSION, grantExp, normalizeExpProfile, requestedExp } from "./utils/exp";

export const LOUNGE_PROFILE_EVENT = "sms-lounge-profile";
export const CHARACTER_REACTION_EVENT = "sms-character-reaction";

const reactionMessages: Record<CharacterReactionKind, string> = {
  schedule: "일정 등록 완료!",
  overtime: "오늘도 힘내세요!",
  annual: "푹 쉬고 와요!",
  overlap: "앗, 일정이 겹쳤어요.",
  drawing: "멋진 그림이에요!",
};

export function defaultCharacterMessage(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 9);
  if (weekday === "Fri" && hour >= 16) return "이번 주도 수고했어요!";
  if (hour < 12) return "좋은 아침이에요. 오늘 일정도 확인해볼까요?";
  if (hour < 18) return "오후 일정도 차근차근 확인해봐요.";
  return "오늘 하루도 수고했어요!";
}

export function defaultProfile(memberId: string): CharacterProfile {
  return { memberId, characterId: "rabbit", level: 1, exp: 0, expVersion: EXP_SYSTEM_VERSION };
}

export function notifyProfile(profile: CharacterProfile, granted = 0) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LOUNGE_PROFILE_EVENT, { detail: { profile, granted } }));
}

export function emitCharacterReaction(kind: CharacterReactionKind, message = reactionMessages[kind]) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHARACTER_REACTION_EVENT, {
    detail: { kind, message, nonce: Date.now() },
  }));
}

export function createLoungeService(repository: LoungeRepository = localLoungeRepository) {
  return {
    getProfile(memberId: string) {
      return normalizeExpProfile(repository.getProfile(memberId) ?? defaultProfile(memberId));
    },
    selectCharacter(memberId: string, characterId: CharacterId) {
      const profile = { ...normalizeExpProfile(repository.getProfile(memberId) ?? defaultProfile(memberId)), characterId };
      repository.saveProfile(profile);
      notifyProfile(profile);
      return profile;
    },
    awardExp(memberId: string, activity: ExpActivity, score?: number) {
      const profile = normalizeExpProfile(repository.getProfile(memberId) ?? defaultProfile(memberId));
      const date = todayIsoKst();
      const daily = repository.getDailyExp(memberId, date);
      const result = grantExp(profile, daily, requestedExp(activity, score));
      repository.saveProfile(result.profile);
      repository.saveDailyExp(result.dailyRecord);
      notifyProfile(result.profile, result.granted);
      return result;
    },
    getDailyExp(memberId: string) {
      return repository.getDailyExp(memberId, todayIsoKst()).amount;
    },
  };
}

export const loungeService = createLoungeService();
