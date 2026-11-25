import { evolutionStages } from "./characterCatalog";
import type { EvolutionStage } from "./types";

export function EvolutionTimeline({
  level,
  previewStage,
  onPreview,
}: {
  level: number;
  previewStage: EvolutionStage;
  onPreview: (stage: EvolutionStage) => void;
}) {
  return (
    <div className="evolution-timeline" aria-label="캐릭터 성장 단계">
      {evolutionStages.map((item, index) => {
        const unlocked = level >= item.level;
        const selected = previewStage === item.stage;
        return (
          <div className="evolution-step-wrap" key={item.stage}>
            {index > 0 ? <span className={level >= item.level ? "evolution-line active" : "evolution-line"} /> : null}
            <button
              type="button"
              className={["evolution-step", unlocked ? "unlocked" : "locked", selected ? "selected" : ""].join(" ")}
              onClick={() => onPreview(item.stage)}
              title={unlocked ? `${item.label} 단계` : `Lv.${item.level} 달성 시 ${item.label} 해금`}
              aria-pressed={selected}
            >
              <span className="evolution-node">{unlocked ? "✓" : item.level}</span>
              <strong>Lv.{item.level} · {item.label}</strong>
              <small>{item.description}</small>
            </button>
          </div>
        );
      })}
    </div>
  );
}
