"use client";

import { useEffect, useMemo, useState } from "react";
import { todayIsoKst } from "../date-utils";
import { appTitle } from "../site-config";
import { StatusControls, WorkerGate } from "../status-controls";
import { reservedMemberNames, useAppData } from "../store";
import { WardrobeDialog } from "./WardrobeDialog";
import { CharacterReaction } from "./CharacterReaction";

import { DrawingVoteArchive } from "./DrawingVoteArchive";
import { DrawingHistory } from "./DrawingHistory";
import { DrawingChallenge } from "./DrawingChallenge";
import { PartnerHero } from "./PartnerHero";
import { defaultCharacterMessage, defaultProfile, loungeService } from "./service";
import {totalExpRequiredForLevel} from "./utils/exp";
import type { CharacterProfile } from "./types";

function Header() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <div className="header-row">
          <a className="brand" href="/" aria-label={appTitle}>
            <span className="section-theme-wordmark">SECTION2</span>
            <span className="brand-divider" />
            <span className="brand-label">{appTitle}</span>
          </a>
          <div className="desktop-mode" />
          <nav className="primary-nav" aria-label="주요 메뉴">
            <a href="/">캘린더</a>
            <a className="active" href="/lounge">라운지</a>
            <a href="/feedback">게시판</a>
            <a href="/admin">관리</a>
          </nav>
        </div>
      </div>
    </header>
  );
}

export default function LoungePage() {
  const data = useAppData();
  const activeMembers = data.members.filter((member) => member.active && !reservedMemberNames.includes(member.name));
  const currentMember = activeMembers.find((member) => member.name === data.actor);
  const [customProfile,setCustomProfile]=useState<CharacterProfile|null>(null);
  const [customizing,setCustomizing]=useState(false);
  const [drawingRevision, setDrawingRevision] = useState("");
  useEffect(() => {
    if (data.saveStatus === "idle" || data.saveStatus === "saved") {
      setDrawingRevision(data.drawingSubmissions.map(item => `${item.id}:${item.score}`).sort().join("|"));
    }
  }, [data.saveStatus, data.drawingSubmissions]);
  const greeting = useMemo(() => defaultCharacterMessage(), []);
  const baseProfile=currentMember ? data.characterProfiles.find(item=>item.memberId===currentMember.id)??defaultProfile(currentMember.id) : null;
  const custom=customProfile?.memberId===baseProfile?.memberId?customProfile:null;
  const progress=custom&&baseProfile&&totalExpRequiredForLevel(custom.level)+custom.exp>totalExpRequiredForLevel(baseProfile.level)+baseProfile.exp?custom:baseProfile;
  const profile=baseProfile&&progress ? {...progress,...(custom?{characterId:custom.characterId,wardrobe:custom.wardrobe}: {})}:null;
  const dailyExp = currentMember
    ? data.dailyCharacterExp.find((item) => item.memberId === currentMember.id && item.date === todayIsoKst())?.amount ?? 0
    : 0;
  useEffect(() => {
    if (!data.hydrated || !currentMember) return;
    if (data.characterProfiles.some((item) => item.memberId === currentMember.id)) return;
    data.initializeCharacterProfile(loungeService.getProfile(currentMember.id));
  }, [currentMember?.id, data.hydrated, data.characterProfiles]);

  return (
    <>
      <Header />
      <WorkerGate members={data.members} actor={data.actor} onSelect={data.setActor} />
      <main className="page-shell lounge-shell">
        <StatusControls actor={data.actor} onActorChange={data.setActor} saveStatus={data.saveStatus} lastSavedAt={data.lastSavedAt} />
        <div className="lounge-title-row">
          <div>
            <span className="lounge-eyebrow">TEAM LOUNGE</span>
            <h1>라운지</h1>
            <p>일정과 함께 성장하는 나만의 캐릭터</p>
          </div>
          {currentMember && profile ? <CharacterReaction memberId={currentMember.id} profile={profile} compact /> : null}
        </div>

        {!profile || !currentMember ? (
          <section className="panel lounge-empty">사용자를 선택하면 캐릭터 라운지가 열립니다.</section>
        ) : (
          <>
            <PartnerHero memberName={currentMember.name} profile={profile} greeting={greeting} dailyExp={dailyExp} onCustomize={()=>setCustomizing(true)}/>
            {customizing&&<WardrobeDialog key={currentMember.id} profile={profile} onSaved={setCustomProfile} onClose={()=>setCustomizing(false)}/>}

            <DrawingChallenge
              memberId={currentMember.id}
              members={activeMembers}
              submissions={data.drawingSubmissions}
              onSubmit={(date, challengeId, imageDataUrl, score, grading) =>
                data.submitDrawing(currentMember.id, date, challengeId, imageDataUrl, score, grading)}
            />
            <DrawingVoteArchive memberId={currentMember.id} />
            <DrawingHistory memberId={currentMember.id} revision={drawingRevision} />
          </>
        )}
      </main>
    </>
  );
}
