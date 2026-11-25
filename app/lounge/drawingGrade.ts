// The archived local-ai variant is retained for already stored drawing feedback.
export type DrawingGrade = {
  method: "local-ai" | "basic";
  score: number;
  version?: "contour-v2" | "contour-v3" | "contour-v4";
  rawScore?: number;
  maskSource?: "strokes" | "rendered-contour" | "rendered-outline";
  comparison?: {size: number; reference: string; drawing: string};
  metrics?: { coverage: number; precision: number; shape: number; extra: number };
  criteria?: { shape: number; proportion: number; features: number; detail: number };
  strengths?: string[];
  improvements?: string[];
  nextStep?: string;
};
