import { CharacterAvatar } from "./CharacterAvatar";
import { characters } from "./characterCatalog";
import type { CharacterId } from "./types";

export function CharacterCollection({
  selectedId,
  savedId,
  level,
  onPreview,
}: {
  selectedId: CharacterId;
  savedId: CharacterId;
  level: number;
  onPreview: (id: CharacterId) => void;
}) {
  return (
    <section className="panel character-collection">
      <div className="lounge-section-head">
        <div>
          <span className="lounge-eyebrow">CHARACTER COLLECTION</span>
          <h2>파트너 선택</h2>
        </div>
        <span>10종 · 눌러서 미리보기</span>
      </div>
      <div className="character-carousel">
        {characters.map((item) => (
          <button
            key={item.id}
            type="button"
            className={[selectedId === item.id ? "previewing" : "", savedId === item.id ? "selected" : ""].join(" ")}
            aria-pressed={selectedId === item.id}
            onClick={() => onPreview(item.id)}
          >
            <span className="character-card-art"><CharacterAvatar characterId={item.id} level={level} compact /></span>
            <strong>{item.name}</strong>
            <small>{savedId === item.id ? "현재 파트너" : selectedId === item.id ? "미리보기 중" : "미리보기"}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
