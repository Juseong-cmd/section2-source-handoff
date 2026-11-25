export type DrawingDifficulty = "쉬움" | "보통" | "도전";
export type DrawingExample = {
  id: string;
  name: string;
  asset: string;
  tile: number;
  difficulty: DrawingDifficulty;
};

const sheets = [
  ["치이카와", "하치와레", "우사기", "잠자는 식빵 고양이", "쉬는 물개", "앉은 토끼", "아기 병아리", "인사하는 흰곰", "앉은 고양이", "웃는 유령"],
  ["동그란 강아지", "아기 펭귄", "통통 햄스터", "손 모은 수달", "앉은 여우", "인사하는 판다", "아기 북극곰", "개구리", "작은 거북이", "아기 부엉이"],
  ["주먹밥 친구", "모찌 토끼", "식빵 친구", "만두 친구", "딸기 친구", "바나나 친구", "우유 친구", "푸딩 친구", "브로콜리 친구", "복숭아 친구"],
  ["아기 코끼리", "앉은 코알라", "작은 고슴도치", "졸린 카피바라", "아기 공룡", "웃는 아홀로틀", "작은 고래", "아기 문어", "구름 친구", "목도리 눈사람"],
  ["쿠키 먹는 치이카와", "사진 찍는 하치와레", "당근 든 우사기", "생선 든 고양이", "꽃 든 토끼", "출근 펭귄", "간식 햄스터", "조개 든 수달", "목도리 여우", "비 오는 날 병아리"],
  ["커피 든 곰", "대나무 판다", "배낭 강아지", "나비넥타이 유미", "별 쿠션 물개", "달 쿠션 토끼", "잎 우산 개구리", "안경 부엉이", "해바라기 햄스터", "연필 든 수달"],
  ["도시락 펭귄", "독서하는 여우", "가방 든 병아리", "귤 카피바라", "하트 코알라", "음악 듣는 곰", "요리사 고양이", "우비 토끼", "공 든 강아지", "달력 판다"],
  ["화분 거북이", "풍선 코끼리", "쿠키 공룡", "사과 고슴도치", "리본 아홀로틀", "선원 문어", "털모자 펭귄", "인사하는 고양이", "씨앗 햄스터", "잠옷 흰곰"],
  ["모험가 치이카와", "우비 하치와레", "요리하는 우사기", "출근하는 체리", "방진복 토끼", "마스크 펭귄", "보안경 수달", "웨이퍼 여우", "연구원 햄스터", "케이크 곰"],
  ["웨이퍼 토끼", "방진복 유미", "방진복 체리", "기록하는 강아지", "보안경 병아리", "소풍 판다", "선원 물개", "우비 카피바라", "꽃다발 펭귄", "그림 그리는 여우"],
] as const;

export const DRAWING_CATALOG_VERSION = "v1";
export const drawingExamples: readonly DrawingExample[] = sheets.flatMap((names, sheet) => names.map((name, tile) => ({
  id: `drawing-${DRAWING_CATALOG_VERSION}-${String(sheet * 10 + tile + 1).padStart(3, "0")}`,
  name,
  asset: `/drawing/${DRAWING_CATALOG_VERSION}/atlas-${String(sheet + 1).padStart(2, "0")}.png`,
  tile,
  difficulty: sheet < 4 ? "쉬움" : sheet < 8 ? "보통" : "도전",
})));

// Fixed-seed shuffle: everyone sees the same daily prompt, with no repeats per cycle.
export function shuffledExamples(cycle: number): DrawingExample[] {
  const result = [...drawingExamples];
  let seed = (0x51a7e2 ^ Math.imul(cycle + 1, 2654435761)) >>> 0;
  for (let index = result.length - 1; index > 0; index--) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const selected = (seed >>> 0) % (index + 1);
    [result[index], result[selected]] = [result[selected], result[index]];
  }
  return result;
}
