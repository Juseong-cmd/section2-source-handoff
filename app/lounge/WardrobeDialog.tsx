'use client';
import {useEffect,useRef,useState} from 'react';
import {CharacterAvatar} from './CharacterAvatar';
import {AccessorySprite} from './AccessorySprite';
import {characters} from './characterCatalog';
import {DrawingCollectionState} from './DrawingCollectionState';
import {availableChoices,itemById,slotNames,syncWardrobe,wardrobeItems,wardrobeSlots,type Equipment,type WardrobeSlot} from './wardrobe';
import type {CharacterId,CharacterProfile} from './types';
export function WardrobeDialog({profile,onSaved,onClose}:{profile:CharacterProfile;onSaved:(p:CharacterProfile)=>void;onClose:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null);
 const [source,setSource]=useState<CharacterProfile|null>(null),[character,setCharacter]=useState<CharacterId>(profile.characterId),[equipment,setEquipment]=useState<Equipment>({});
 const [historyLimit,setHistoryLimit]=useState(10);
 const [tab,setTab]=useState('items'),[slot,setSlot]=useState<WardrobeSlot>('head'),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{const previous=document.activeElement as HTMLElement;dialog.current?.showModal();return()=>previous?.focus();},[]);
 useEffect(()=>{const c=new AbortController();void load(c.signal);return()=>c.abort();},[profile.memberId]);
 async function load(signal?:AbortSignal) {
  setError('');try {const r=await fetch(`/api/lounge-wardrobe?memberId=${encodeURIComponent(profile.memberId)}`,{cache:'no-store',signal});const d=await r.json();if(!r.ok)throw new Error(d.error);if(signal?.aborted)return;setSource(d.profile);setCharacter(d.profile.characterId);setEquipment(d.profile.wardrobe.equipped[d.profile.characterId]??{});onSaved(d.profile);}catch(e){if(!signal?.aborted)setError(e instanceof Error?e.message:'꾸미기 정보를 확인하지 못했습니다.');}
 }
 const state=source?syncWardrobe(source.wardrobe,source.level,source.characterId):null;
 const draft=state?{...state,equipped:{...state.equipped,[character]:equipment}}:undefined;
 async function request(command:Record<string,unknown>) {
  setSaving(true);setError('');setNotice('');
  try {const r=await fetch('/api/lounge-wardrobe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({memberId:profile.memberId,...command})});const d=await r.json();if(!r.ok)throw new Error(d.error);setSource(d.profile);onSaved(d.profile);return d.profile as CharacterProfile;}catch(e){setError(e instanceof Error?e.message:'저장하지 못했습니다.');return null;}finally{setSaving(false);}
 }
 function equip(id:string) {
  const item=itemById(id);if(!item)return;
  setEquipment(old=>{
   if(old[item.slot]===id){const next={...old};delete next[item.slot];return next;}
   if(item.slot==='outfit'){setNotice('전체 코스튬을 미리 봅니다. 머리·얼굴·목·손 장식은 해제됩니다.');return {...(old.background?{background:old.background}:{}),outfit:id};}
   if(item.slot!=='background'&&old.outfit){setNotice('장신구 미리보기를 위해 전체 코스튬을 해제했어요.');const next={...old};delete next.outfit;return {...next,[item.slot]:id};}
   return {...old,[item.slot]:id};
  });
 }
 async function claim(id:string) {if(await request({kind:'claim',itemId:id})){setNotice('아이템을 보관함에 받았어요. 내 아이템에서 착용해보세요.');}}
 async function apply() {if(!source)return;const saved=await request({kind:'equip',characterId:character,equipment,before:source.wardrobe?.equipped[character]??{},previousCharacterId:source.characterId});if(saved)onClose();}
 const list=wardrobeItems.filter(i=>i.slot===slot&&(tab==='rewards'||state?.owned.includes(i.id)));
 return <dialog ref={dialog} className="modal-card wardrobe-dialog" aria-labelledby="wardrobe-title" onCancel={e=>{if(saving)e.preventDefault();}} onClose={onClose}>
  <header className="wardrobe-dialog-heading"><div><h2 id="wardrobe-title">나만의 꾸미기</h2><p>모으고, 골라 입고, 언제든 바꿔보세요.</p></div><button type="button" className="secondary-button small" disabled={saving} onClick={onClose}>닫기</button></header>
  {!source?<DrawingCollectionState kind={error?'error':'loading'} title={error?'꾸미기를 불러오지 못했어요.':'꾸미기를 불러오는 중…'} action={error?<button type="button" className="secondary-button small" onClick={()=>void load()}>다시 시도</button>:undefined}>{error||'보유 아이템과 성장 보상을 확인하고 있어요.'}</DrawingCollectionState>:<div className="wardrobe-body">
   <aside className="wardrobe-preview"><details open><summary>착장 미리보기 · Lv.{source.level}</summary><CharacterAvatar characterId={character} level={source.level} wardrobe={draft} interactive/></details><p>미리보기는 적용 후 저장돼요.</p><button type="button" className="secondary-button small" disabled={saving} onClick={()=>setEquipment({})}>모두 해제</button><details className="wardrobe-equipment-details"><summary>장착 부위 확인 · 개별 해제</summary><div className="wardrobe-equipped">{wardrobeSlots.map(s=><div key={s}><span>{slotNames[s]}</span><button type="button" disabled={!equipment[s]||saving} onClick={()=>setEquipment(old=>{const n={...old};delete n[s];return n;})} aria-label={`${slotNames[s]} 해제`}>{itemById(equipment[s]??'')?.name??'착용 안 함'}{equipment[s]?' ×':''}</button></div>)}</div></details></aside>
   <section className="wardrobe-content" aria-label="꾸미기 보관함"><nav className="wardrobe-tabs" aria-label="꾸미기 메뉴">{[['characters','캐릭터'],['items','내 아이템'],['rewards','성장 보상']].map(([id,label])=><button type="button" key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</nav>
    <div className="wardrobe-summary"><strong>선택권 {availableChoices(state!)}개</strong><span>매 5레벨 1개 · 사용 기한 없음</span></div>
    {tab==='characters'?<div className="wardrobe-grid">{characters.map(c=><button type="button" className="wardrobe-item" key={c.id} aria-pressed={character===c.id} disabled={saving} onClick={()=>{setCharacter(c.id);setEquipment(state!.equipped[c.id]??{});setNotice('캐릭터를 미리 보고 있어요. 적용하면 파트너가 변경됩니다.');}}><CharacterAvatar characterId={c.id} level={source.level} wardrobe={state!} compact/><strong>{c.name}</strong><span>{character===c.id?'미리보기 중':'선택하기'}</span></button>)}</div>:<>
     {tab==='rewards'&&<details className="wardrobe-reward-history"><summary>달성한 성장 보상 · {state!.rewardedThrough/5}회</summary>{source.level>=40&&<p>스타일 마스터 칭호 · Lv.40 달성</p>}<ul>{Array.from({length:Math.min(historyLimit,state!.rewardedThrough/5)},(_,i)=>state!.rewardedThrough-i*5).map(level=><li key={level}><strong>Lv.{level}</strong><span>선택권 지급 완료{level===20?' · 방진복 획득':level===40?' · 웨이퍼·기념 칭호 획득':''}</span></li>)}</ul>{historyLimit<state!.rewardedThrough/5&&<button type="button" className="secondary-button small" onClick={()=>setHistoryLimit(n=>n+10)}>이전 보상 더 보기</button>}</details>}
     {tab==='rewards'&&<p className="wardrobe-help">획득한 선택권으로 원하는 아이템을 받아보세요. Lv.20 방진복·Lv.40 웨이퍼 코스튬은 자동 지급됩니다. 모든 아이템을 모으면 다음 업데이트를 위해 선택권을 보관할 수 있어요.</p>}
     <nav className="wardrobe-filters" aria-label="장착 부위">{wardrobeSlots.map(s=><button type="button" key={s} aria-pressed={slot===s} onClick={()=>setSlot(s)}>{slotNames[s]}</button>)}</nav>
     <div className="wardrobe-grid">{list.map(item=>{
      const owned=state!.owned.includes(item.id),locked=source.level<item.level,selected=equipment[item.slot]===item.id;
      return <article className={`wardrobe-item${selected?' selected':''}`} key={item.id}><div className={`wardrobe-thumbnail${item.scene?` scene-${item.scene}`:''}`}>{item.asset?<AccessorySprite item={item}/>:item.stage?<CharacterAvatar characterId={character} level={source.level} stage={item.stage} compact/>:<span aria-hidden="true">✧</span>}</div><strong>{item.name}</strong><span>{selected?'장착 미리보기':owned?'보유 중':`Lv.${item.level}부터`}</span>
       {owned?<button type="button" className="secondary-button small" disabled={saving} aria-pressed={selected} onClick={()=>equip(item.id)}>{selected?'해제':'착용해보기'}</button>:<button type="button" className="secondary-button small" disabled={saving||locked||!!item.stage||!availableChoices(state!)} onClick={()=>void claim(item.id)}>{item.stage?'레벨 달성 시 자동 지급':locked?'아직 잠겨 있어요':'선택권 1개로 받기'}</button>}
      </article>;
     })}</div>
     {!list.length&&<DrawingCollectionState kind="empty" title="아직 이 부위의 아이템이 없어요.">성장 보상에서 선택권으로 아이템을 받을 수 있어요.</DrawingCollectionState>}
    </>}
   </section>
  </div>}
  {error&&source&&<p className="wardrobe-message error" role="alert">{error}</p>}{notice&&<p className="wardrobe-message" role="status">{notice}</p>}
  <footer className="wardrobe-footer"><span>{saving?'저장 중…':'아이템 받기는 즉시 보관 · 착장은 적용 시 저장'}</span><div><button type="button" className="secondary-button" disabled={saving} onClick={onClose}>취소</button><button type="button" className="primary-button" disabled={!source||saving} onClick={()=>void apply()}>적용</button></div></footer>
 </dialog>;
}
