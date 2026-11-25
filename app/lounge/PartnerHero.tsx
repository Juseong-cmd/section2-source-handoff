import {CharacterReaction} from './CharacterReaction';
import {ExpProgress} from './ExpProgress';
import {getCharacter} from './characterCatalog';
import {expRemainingToLevel} from './utils/exp';
import {availableChoices,syncWardrobe} from './wardrobe';
import type {CharacterProfile} from './types';
export function PartnerHero({memberName,profile,greeting,dailyExp,onCustomize}:{memberName:string;profile:CharacterProfile;greeting:string;dailyExp:number;onCustomize:()=>void}) {
 const next=(Math.floor(profile.level/5)+1)*5;
 const wardrobe=syncWardrobe(profile.wardrobe,profile.level,profile.characterId);
 return <section className="panel partner-hero wardrobe-hero">
  <div className="partner-visual"><CharacterReaction memberId={profile.memberId} profile={{...profile,wardrobe}} defaultMessage={greeting} interactive/><p>나만의 조합으로 꾸며보세요</p></div>
  <div className="partner-details"><div className="partner-heading"><div><span className="lounge-eyebrow">{memberName}님의 파트너</span><h2>{getCharacter(profile.characterId).name}</h2></div><span className="level-badge">Lv.{profile.level}</span></div>
   {profile.level>=40&&<span className="wardrobe-achievement">스타일 마스터 · Lv.40 달성</span>}
   <ExpProgress profile={profile}/><div className="hero-exp-meta"><span>오늘 일반 활동 <strong>{dailyExp} / 15 EXP</strong></span><span>투표 보너스는 별도 지급</span></div>
   <div className="wardrobe-next"><strong>다음 보상 Lv.{next}</strong><p>꾸미기 선택권까지 {expRemainingToLevel(profile,next)} EXP</p><div className="wardrobe-milestones">{[next,next+5,next+10].map(l=><span key={l}>Lv.{l} · 선택권</span>)}</div></div>
   <button type="button" className="primary-button" onClick={onCustomize}>꾸미기{availableChoices(wardrobe)>0?` · 선택권 ${availableChoices(wardrobe)}개`:''}</button>
  </div>
 </section>;
}
