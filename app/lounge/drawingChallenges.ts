import { characters } from "./characterCatalog.ts";
import type { DrawingReferenceId } from "./drawingSimilarity.ts";
import { shuffledExamples } from "./drawingCatalog.ts";

const KOREAN_TIME_ZONE = "Asia/Seoul";

const referenceByCharacter = {
  rabbit: "rabbit",
  cat_orange: "cat",
  cat_russian_blue: "cat",
  dog: "dog",
  penguin: "penguin",
  otter: "otter",
  hamster: "hamster",
  fox: "fox",
  chick: "chick",
  bear: "bear",
} satisfies Record<(typeof characters)[number]["id"], DrawingReferenceId>;

export function koreanDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KOREAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getDailyDrawingChallenge(dateKey = koreanDateKey()) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const dayNumber = Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
  // Keep release-day drawings and scores associated with their original reference.
  const firstDay = Math.floor(Date.UTC(2026, 10, 3) / 86_400_000);
  if (dayNumber >= firstDay) {
    const offset = dayNumber - firstDay;
    const cycle = Math.floor(offset / 100);
    const pool = shuffledExamples(cycle);
    // Prevent a duplicate at the boundary between shuffled cycles as well.
    if (cycle > 0 && pool[0].id === shuffledExamples(cycle - 1)[99].id) {
      [pool[0], pool[1]] = [pool[1], pool[0]];
    }
    const example = pool[offset % 100];
    return { ...example, difficultyLabel: example.difficulty, difficulty: example.difficulty === "쉬움" ? 1 : example.difficulty === "보통" ? 3 : 5, referenceId: undefined, prompt: `${example.name}의 윤곽과 특징을 따라 그려보세요.` };
  }
  const character = characters[((dayNumber % characters.length) + characters.length) % characters.length]!;
  return {
    ...character,
    referenceId: referenceByCharacter[character.id],
    prompt: `${character.name}의 얼굴 윤곽과 특징을 따라 그려보세요.`,
    difficulty: 2 + Math.abs(dayNumber % 3),
    difficultyLabel: "보통",
    tile: undefined,
  };
}
