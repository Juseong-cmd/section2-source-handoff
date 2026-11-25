"use client";

import { useEffect, useState } from "react";
import { CharacterAvatar } from "./CharacterAvatar";
import { CHARACTER_REACTION_EVENT, loungeService, LOUNGE_PROFILE_EVENT } from "./service";
import type { CharacterProfile, CharacterReactionKind, EvolutionStage } from "./types";

type ReactionDetail = { kind: CharacterReactionKind; message: string; nonce: number };

export function CharacterReaction({
  memberId,
  compact = false,
  reactionOnly = false,
  stage,
  profile: providedProfile,
  defaultMessage,
  interactive = false,
}: {
  memberId?: string;
  compact?: boolean;
  reactionOnly?: boolean;
  stage?: EvolutionStage;
  profile?: CharacterProfile;
  defaultMessage?: string;
  interactive?: boolean;
}) {
  const [eventProfile, setEventProfile] = useState<CharacterProfile | null>(null);
  const [reaction, setReaction] = useState<ReactionDetail | null>(null);
  const profile = providedProfile ?? eventProfile;

  useEffect(() => {
    setEventProfile(memberId ? loungeService.getProfile(memberId) : null);
  }, [memberId, providedProfile]);

  useEffect(() => {
    const onProfile = (event: Event) => {
      const next = (event as CustomEvent<{ profile: CharacterProfile }>).detail.profile;
      if (next.memberId === memberId) setEventProfile(next);
    };
    const onReaction = (event: Event) => {
      const detail = (event as CustomEvent<ReactionDetail>).detail;
      setReaction(detail);
      window.setTimeout(() => setReaction((current) => current?.nonce === detail.nonce ? null : current), 2200);
    };
    window.addEventListener(LOUNGE_PROFILE_EVENT, onProfile);
    window.addEventListener(CHARACTER_REACTION_EVENT, onReaction);
    return () => {
      window.removeEventListener(LOUNGE_PROFILE_EVENT, onProfile);
      window.removeEventListener(CHARACTER_REACTION_EVENT, onReaction);
    };
  }, [memberId]);

  if (!profile || (reactionOnly && !reaction)) return null;
  return (
    <div className={["character-reaction", compact ? "compact" : "", reactionOnly ? "notification" : ""].join(" ")} aria-live="polite">
      <CharacterAvatar characterId={profile.characterId} level={profile.level} wardrobe={profile.wardrobe} stage={stage} compact={compact} bouncing={!!reaction} interactive={interactive} />
      {reaction || defaultMessage ? <span className="character-reaction-bubble">{reaction?.message ?? defaultMessage}</span> : null}
    </div>
  );
}
