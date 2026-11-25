import type { CharacterProfile } from "./types";
import { expRequiredForLevel } from "./utils/exp";

export function ExpProgress({ profile }: { profile: CharacterProfile }) {
  const required = expRequiredForLevel(profile.level);
  const progress = Math.min(100, (profile.exp / required) * 100);

  return (
    <div className="hero-exp">
      <div className="hero-exp-label">
        <strong>Lv.{profile.level}</strong>
        <span>{`${profile.exp} / ${required} EXP`}</span>
      </div>
      <div className="hero-exp-track" role="progressbar" aria-label="현재 레벨 경험치" aria-valuemin={0} aria-valuemax={required || 1} aria-valuenow={profile.exp}>
        <i style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
