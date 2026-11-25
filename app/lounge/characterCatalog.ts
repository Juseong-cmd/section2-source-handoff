import type { CharacterId, EvolutionStage } from "./types";

export type CharacterDefinition = {
  id: CharacterId;
  name: string;
  asset: string;
  evolutionAssets: Record<EvolutionStage, string>;
  tone: string;
};

function defineCharacter(id: CharacterId, name: string, slug: string, tone: string): CharacterDefinition {
  const asset = `/lounge/characters/${slug}.png`;
  return {
    id,
    name,
    asset,
    evolutionAssets: {
      basic: asset,
      cleanroom: `/lounge/characters/evolution/${slug}-cleanroom.png`,
      manufacturing: `/lounge/characters/evolution/${slug}-full.png`,
    },
    tone,
  };
}

export const characters: CharacterDefinition[] = [
  defineCharacter("rabbit", "토끼", "rabbit", "#fff4f6"),
  defineCharacter("cat_orange", "고양이(체리)", "cat-orange", "#f4f1ee"),
  defineCharacter("cat_russian_blue", "고양이(유미)", "cat-russian-blue", "#eef3fb"),
  defineCharacter("dog", "강아지", "dog", "#fff8ec"),
  defineCharacter("penguin", "펭귄", "penguin", "#f3f5fb"),
  defineCharacter("otter", "수달", "otter", "#f2f8ff"),
  defineCharacter("hamster", "햄스터", "hamster", "#fff8ef"),
  defineCharacter("fox", "여우", "fox", "#fff3f4"),
  defineCharacter("chick", "병아리", "chick", "#fffbec"),
  defineCharacter("bear", "곰", "bear", "#fff3ef"),
];

export const evolutionStages: Array<{ stage: EvolutionStage; level: number; label: string; description: string }> = [
  { stage: "basic", level: 1, label: "기본", description: "첫 출근" },
  { stage: "cleanroom", level: 20, label: "방진복", description: "FAB 입성" },
  { stage: "manufacturing", level: 40, label: "Master", description: "마스크 + 웨이퍼 장비" },
];

export function getCharacter(characterId: CharacterId) {
  return characters.find((character) => character.id === characterId) ?? characters[0]!;
}

export function stageForLevel(level: number): EvolutionStage {
  if (level >= 40) return "manufacturing";
  if (level >= 20) return "cleanroom";
  return "basic";
}
