export type CharacterId =
  | "rabbit"
  | "cat_orange"
  | "cat_russian_blue"
  | "dog"
  | "penguin"
  | "otter"
  | "hamster"
  | "fox"
  | "chick"
  | "bear";

export type EvolutionStage = "basic" | "cleanroom" | "manufacturing";

export type CharacterProfile = {
  memberId: string;
  characterId: CharacterId;
  level: number;
  exp: number;
  expVersion?: number;
  wardrobe?: import("./wardrobe").WardrobeState;
};

export type ExpActivity = "schedule" | "attendance" | "drawing";

export type CharacterReactionKind = "schedule" | "overtime" | "annual" | "overlap" | "drawing";

export type DailyExpRecord = {
  memberId: string;
  date: string;
  amount: number;
};

export type DrawingSubmission = {
  id: string;
  memberId: string;
  date: string;
  challengeId: string;
  imageDataUrl: string;
  score: number;
  grading?: import("./drawingGrade").DrawingGrade;
  createdAt: string;
};

export type LoungeState = {
  profiles: Record<string, CharacterProfile>;
  dailyExp: Record<string, DailyExpRecord>;
};
