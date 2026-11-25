"use client";

import { FormEvent, useState } from "react";
import { appTitle } from "../site-config";
import { StatusControls, WorkerGate } from "../status-controls";
import { reservedMemberNames, swatches, useAppData } from "../store";
import {itemById} from "../lounge/wardrobe";
import { CharacterAvatar } from "../lounge/CharacterAvatar";
import { getCharacter, stageForLevel } from "../lounge/characterCatalog";
import { defaultProfile } from "../lounge/service";
import { expRequiredForLevel, normalizeExpProfile } from "../lounge/utils/exp";

const memberNameSorter = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });
const stageLabels = { basic: "기본", cleanroom: "방진복", manufacturing: "Master" } as const;

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
            <a href="/lounge">라운지</a>
            <a href="/feedback">게시판</a>
            <a className="active" href="/admin">
              관리
            </a>
          </nav>
        </div>
      </div>
    </header>
  );
}

export default function AdminPage() {
  const data = useAppData();
  const [memberName, setMemberName] = useState("");
  const [memberColor, setMemberColor] = useState(swatches[0]);
  const characterRows = data.members
    .filter((member) => !reservedMemberNames.includes(member.name))
    .sort((a, b) => Number(b.active) - Number(a.active) || memberNameSorter.compare(a.name, b.name))
    .map((member) => {
      const profile = normalizeExpProfile(
        data.characterProfiles.find((item) => item.memberId === member.id) ?? defaultProfile(member.id),
      );
      const requiredExp = expRequiredForLevel(profile.level);
      return {
        member,
        profile,
        character: getCharacter(profile.characterId),
        stage: profile.wardrobe ? itemById(profile.wardrobe.equipped[profile.characterId]?.outfit??'')?.stage??'basic' : stageForLevel(profile.level),
        progress: Math.round((profile.exp / requiredExp) * 100),
        requiredExp,
      };
    });

  function submitMember(event: FormEvent) {
    event.preventDefault();
    data.addMember(memberName, memberColor);
    setMemberName("");
  }

  return (
    <>
      <Header />
      <WorkerGate members={data.members} actor={data.actor} onSelect={data.setActor} />
      <main className="narrow-shell">
        <h1 className="admin-title">관리</h1>
        <StatusControls
          actor={data.actor}
          onActorChange={data.setActor}
          saveStatus={data.saveStatus}
          lastSavedAt={data.lastSavedAt}
        />
        <div className="admin-team-shell">
          <section className="panel admin-panel admin-team-panel">
            <div className="admin-character-heading">
              <h2>팀원 관리·성장 현황</h2>
              <span>{characterRows.length}명</span>
            </div>
            <form className="sub-form admin-member-form" onSubmit={submitMember}>
              <label className="field">
                <span>이름</span>
                <input value={memberName} onChange={(event) => setMemberName(event.target.value)} placeholder="새 팀원 이름" />
              </label>
              <div className="admin-member-color-field">
                <span>색상</span>
                <div className="swatches">
                  {swatches.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={memberColor === color ? "selected" : ""}
                      style={{ backgroundColor: color }}
                      aria-label={color}
                      onClick={() => setMemberColor(color)}
                    />
                  ))}
                </div>
              </div>
              <button type="submit" className="primary-button admin-member-add">
                + 팀원 추가
              </button>
            </form>
            {characterRows.length === 0 ? <p className="muted-text">등록된 팀원이 없습니다.</p> : (
              <ul className="admin-member-list">
                {characterRows.map(({ member, profile, character, stage, progress, requiredExp }) => (
                  <li key={member.id} className={member.active ? "" : "inactive"}>
                    <label
                      className="member-color-button"
                      style={{ backgroundColor: member.color }}
                      aria-label={`${member.name} 색상 변경`}
                    >
                      <input
                        type="color"
                        value={member.color}
                        onChange={(event) => data.updateMember(member.id, { color: event.target.value })}
                      />
                    </label>
                    <div className="admin-character-avatar">
                      <CharacterAvatar characterId={profile.characterId} level={profile.level} wardrobe={profile.wardrobe} compact />
                    </div>
                    <div className="admin-character-info">
                      <div className="admin-character-name">
                        <strong>{member.name}</strong>
                        {!member.active ? <em>비활성</em> : null}
                        <b>Lv.{profile.level}</b>
                      </div>
                      <span>{character.name} · {stageLabels[stage]}</span>
                      <div className="admin-character-progress" aria-label={`${member.name} 경험치 ${progress}%`}>
                        <i style={{ width: `${progress}%` }} />
                      </div>
                      <small>{`${profile.exp} / ${requiredExp} EXP`}</small>
                    </div>
                    <div className="row-actions admin-member-actions">
                      <button
                        type="button"
                        onClick={() => data.updateMember(member.id, { active: !member.active })}
                      >
                        {member.active ? "비활성" : "활성"}
                      </button>
                      <button type="button" className="danger-action" onClick={() => data.deleteMember(member.id)}>
                        삭제
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
