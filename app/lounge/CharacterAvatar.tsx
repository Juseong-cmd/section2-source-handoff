"use client";

import type { PointerEvent } from "react";
import { getCharacter, stageForLevel } from "./characterCatalog";
import { accessoryFit, characterAnatomy, itemById, type WardrobeState } from "./wardrobe";
import { AccessorySprite } from "./AccessorySprite";
import { useState } from "react";
import type { CharacterId, EvolutionStage } from "./types";

export function CharacterAvatar({
  characterId,
  level,
  stage,
  compact = false,
  bouncing = false,
  interactive = false,
  wardrobe,
}: {
  characterId: CharacterId;
  level: number;
  stage?: EvolutionStage;
  compact?: boolean;
  bouncing?: boolean;
  interactive?: boolean;
  wardrobe?: WardrobeState;
}) {
  const character = getCharacter(characterId);
  const equipment=wardrobe?.equipped[characterId]??{};
  const currentStage = stage ?? (wardrobe ? (itemById(equipment.outfit??'')?.stage??'basic') : stageForLevel(level));
  const [failed,setFailed]=useState('');
  const scene=itemById(equipment.background??'')?.scene;
  const art=character.evolutionAssets[currentStage];
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!interactive) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    event.currentTarget.style.setProperty("--avatar-rotate-x", `${(-y * 7).toFixed(2)}deg`);
    event.currentTarget.style.setProperty("--avatar-rotate-y", `${(x * 9).toFixed(2)}deg`);
    event.currentTarget.style.setProperty("--avatar-shift-x", `${(x * 5).toFixed(2)}px`);
  }

  function reset(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.style.removeProperty("--avatar-rotate-x");
    event.currentTarget.style.removeProperty("--avatar-rotate-y");
    event.currentTarget.style.removeProperty("--avatar-shift-x");
  }

  return (
    <div
      className={["character-avatar", "wardrobe-avatar", scene?`scene-${scene}`:"", currentStage, compact ? "compact" : "", bouncing ? "bounce" : "", interactive ? "interactive" : ""].join(" ")}
      style={{ backgroundColor: character.tone }}
      aria-label={`${character.name} 캐릭터`}
      onPointerMove={move}
      onPointerLeave={reset}
    >
      <div className="avatar-layer-stack">
        <img className="character-art" src={failed===art?character.asset:art} alt="" aria-hidden="true" onError={()=>setFailed(art)} />
        {wardrobe&&currentStage==='basic'&&(['neck','face','head','hand'] as const).map(slot=>{
          const item=itemById(equipment[slot]??'');if(!item?.asset)return null;
          const a=accessoryFit(characterId,item);if(!a)return null;
          return <span key={`${slot}-${item.id}`} className={`avatar-accessory slot-${slot}`} style={{left:`${a.x}%`,top:`${a.y}%`,width:`${a.w}%`,height:`${a.h}%`,transformOrigin:`${a.pivotX}% ${a.pivotY}%`,transform:`translate(-${a.pivotX}%,-${a.pivotY}%) rotate(${a.rotate}deg)`}}><AccessorySprite item={item}/></span>;
        })}
        {wardrobe&&currentStage==='basic'&&equipment.hand&&<img className="avatar-hand-grip" src={character.asset} alt="" aria-hidden="true" style={{clipPath:`ellipse(1.25% 1.4% at ${characterAnatomy[characterId].grip.x}% ${characterAnatomy[characterId].grip.y}%)`}}/>}
      </div>
    </div>
  );
}
