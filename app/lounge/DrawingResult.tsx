"use client";

import { DrawingComparison } from "./DrawingComparison";
import type { DrawingGrade } from "./drawingGrade";
import { useEffect, useState } from "react";

function resultCopy(score: number) {
  if (score >= 90) return { rank: "S RANK", message: "멋지게 완성했어요!" };
  if (score >= 80) return { rank: "A RANK", message: "특징을 잘 살렸어요!" };
  if (score >= 65) return { rank: "B RANK", message: "특징을 잘 잡았어요." };
  return { rank: "C RANK", message: "한 번 더 도전해볼까요?" };
}

export function DrawingResult({ score, grantedExp, grading }: { score: number; grantedExp: number; grading?: DrawingGrade }) {
  const [displayScore, setDisplayScore] = useState(0);
  const copy = resultCopy(score);

  useEffect(() => {
    const startedAt = performance.now();
    const duration = 520;
    let frame = 0;
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      setDisplayScore(Math.round(score * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [score]);

  return (
    <div className="drawing-result" aria-live="polite">
      <div className="drawing-result-score"><strong>{displayScore}</strong><span>점</span></div>
      <div className="drawing-result-copy">
        <strong>{copy.rank}</strong>
        <span>{copy.message}</span>
      </div>
      {grading && <div className="drawing-grade-feedback">
        <strong>{grading.method === "local-ai" ? "상세 채점" : "형태 비교 채점"}</strong>
        {grading.rawScore!==undefined&&<p className="drawing-score-note">게임 점수는 세부 형태 비교값을 완화해 반영합니다.</p>}
        {grading.metrics && <>
          <p className="drawing-metrics-caption">세부 항목 · 각 100점 기준</p>
          <dl className="drawing-metrics" aria-label="세부 형태 비교 점수">
            {([
              ["선 완성도", grading.metrics.coverage],
              ["선 정확도", grading.metrics.precision],
              ["전체 형태", grading.metrics.shape],
              ["불필요한 선 억제", grading.metrics.extra],
            ] as const).map(([label, value]) => <div className="drawing-metric-row" key={label}>
              <dt>{label}</dt><dd><strong>{value}</strong><span> / 100</span></dd>
              <dd className="drawing-metric-track" aria-hidden="true"><span style={{width: `${Math.max(0, Math.min(100, value))}%`}} /></dd>
            </div>)}
          </dl>
        </>}
        {grading.criteria && <dl className="drawing-metrics" aria-label="세부 채점 점수">
          {([
            ["형태", grading.criteria.shape, 30],
            ["비율", grading.criteria.proportion, 25],
            ["특징", grading.criteria.features, 25],
            ["세부 표현", grading.criteria.detail, 20],
          ] as const).map(([label, value, max]) => <div className="drawing-metric-row" key={label}>
            <dt>{label}</dt><dd><strong>{value}</strong><span> / {max}</span></dd>
            <dd className="drawing-metric-track" aria-hidden="true"><span style={{width: `${Math.max(0, Math.min(100, value / max * 100))}%`}} /></dd>
          </div>)}
        </dl>}
        {grading.strengths && <><p>잘한 점</p><ul>{grading.strengths.map((text, i) => <li key={i}>{text}</li>)}</ul></>}
        {grading.improvements && <><p>개선할 점</p><ul>{grading.improvements.map((text, i) => <li key={i}>{text}</li>)}</ul></>}
        {grading.nextStep && <p>다음 연습: {grading.nextStep}</p>}
      </div>}
      {grading?.comparison && <DrawingComparison comparison={grading.comparison} />}
      {grantedExp > 0 ? <div className="drawing-exp-award">+{grantedExp} EXP</div> : null}
    </div>
  );
}
