"use client";
import {useEffect,useId,useRef,useState,type PointerEvent} from "react";
import {appStoragePrefix} from "../site-config";
import {hexToHsv,hsvToHex,type HsvColor} from "./drawingColor";
export const DRAWING_COLORS=["#172033","#FFFFFF","#737373","#D5D5D5","#1428A0","#3478F6","#76D7EA","#BDEFFF","#177A55","#38B86B","#A4D65E","#D5F3CB","#D94824","#FF6B6B","#FFB3C6","#FFE1E8","#E6A11A","#FFD83D","#FFF2A8","#FFF8DC","#8E44AD","#B890F5","#E4D1FF","#71513C","#A97951","#CCA47C","#EED3B3","#F9E7CF","#DBA49A","#BC6868","#C8DBF2","#D5ECDF"];
export function DrawingColorTools({color,onColor,width,onWidth,picking,onPick}: {color:string;onColor:(color:string)=>void;width:number;onWidth:(width:number)=>void;picking:boolean;onPick:()=>void}) {
  const [hex,setHex]=useState(color),[hsv,setHsv]=useState(()=>hexToHsv(color));
  const current=useRef(hsv);
  const help=useId();
  const [fineOpen,setFineOpen]=useState(false);
  useEffect(()=>{
    const media=window.matchMedia("(min-width: 900px)");
    const sync=()=>setFineOpen(media.matches);sync();media.addEventListener("change",sync);
    return()=>media.removeEventListener("change",sync);
  },[]);
  const [recent,setRecent]=useState<string[]>([]);
  useEffect(()=>{
    setHex(color);
    if(hsvToHex(current.current)!==color.toLowerCase()){const next=hexToHsv(color,current.current.h);current.current=next;setHsv(next);}
  },[color]);
  useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem(appStoragePrefix+"-drawing-colors")??"[]");if(Array.isArray(saved))setRecent(saved.filter(c=>typeof c==="string"&&/^#[0-9a-f]{6}$/i.test(c)).slice(0,8));}catch{}},[]);
  function remember(next:string) {
    setRecent(old=>{const value=[next,...old.filter(c=>c.toLowerCase()!==next.toLowerCase())].slice(0,8);try{localStorage.setItem(appStoragePrefix+"-drawing-colors",JSON.stringify(value));}catch{}return value;});
  }
  function choose(next:string) {
    if(!/^#[0-9a-f]{6}$/i.test(next))return;
    const converted=hexToHsv(next,current.current.h);current.current=converted;setHsv(converted);onColor(next);setHex(next);remember(next);
  }
  function adjust(next:HsvColor) {current.current=next;setHsv(next);const value=hsvToHex(next);onColor(value);setHex(value);}
  function commit(){remember(hsvToHex(current.current));}
  function point(event:PointerEvent<HTMLDivElement>) {
    const bounds=event.currentTarget.getBoundingClientRect();
    adjust({...current.current,s:Math.max(0,Math.min(100,(event.clientX-bounds.left)/bounds.width*100)),v:Math.max(0,Math.min(100,100-(event.clientY-bounds.top)/bounds.height*100))});
  }
  return <div className="drawing-color-tools">
    <details className="drawing-fine-colors" open={fineOpen} onToggle={event=>setFineOpen(event.currentTarget.open)}><summary>세밀한 색상 조절</summary>
    <div className="drawing-color-picker" role="group" aria-label="세밀한 색상 조절">
      <div className="drawing-sv-field" role="slider" tabIndex={0} aria-label="채도·명도 선택" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hsv.s)} aria-valuetext={`채도 ${Math.round(hsv.s)}%, 명도 ${Math.round(hsv.v)}%`} aria-describedby={help}
        style={{backgroundColor:hsvToHex({h:hsv.h,s:100,v:100})}}
        onPointerDown={event=>{event.preventDefault();event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);point(event);}}
        onPointerMove={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))point(event);}}
        onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);commit();}}
        onPointerCancel={commit}
        onKeyDown={event=>{const step=event.shiftKey?10:1;let {h,s,v}=current.current;
          if(event.key==="ArrowLeft")s-=step;else if(event.key==="ArrowRight")s+=step;else if(event.key==="ArrowUp")v+=step;else if(event.key==="ArrowDown")v-=step;else if(event.key==="Home")s=0;else if(event.key==="End")s=100;else return;
          event.preventDefault();adjust({h,s:Math.max(0,Math.min(100,s)),v:Math.max(0,Math.min(100,v))});commit();}}>
        <span className="drawing-color-cursor" style={{left:`${hsv.s}%`,top:`${100-hsv.v}%`}}/>
      </div>
      <small id={help}>영역을 드래그해 색의 진하기와 밝기를 조절하세요. 방향키로 미세 조절할 수도 있어요.</small>
      <label className="drawing-color-slider">색상 <input aria-label="색상 각도" className="drawing-hue-slider" type="range" min="0" max="360" value={hsv.h} onChange={e=>adjust({...current.current,h:Number(e.target.value)})} onPointerUp={commit} onKeyUp={commit} onBlur={commit}/><output>{Math.round(hsv.h)}°</output></label>
      <label className="drawing-color-slider">채도 <input aria-label="채도" type="range" min="0" max="100" value={hsv.s} onChange={e=>adjust({...current.current,s:Number(e.target.value)})} onPointerUp={commit} onKeyUp={commit} onBlur={commit}/><output>{Math.round(hsv.s)}%</output></label>
      <label className="drawing-color-slider">명도 <input aria-label="명도" type="range" min="0" max="100" value={hsv.v} onChange={e=>adjust({...current.current,v:Number(e.target.value)})} onPointerUp={commit} onKeyUp={commit} onBlur={commit}/><output>{Math.round(hsv.v)}%</output></label>
    </div>
    </details>
    <div className="drawing-custom-color"><label>선택 색상 <input type="color" value={color} onChange={e=>choose(e.target.value)}/></label><label>HEX <input aria-label="HEX 색상 코드" value={hex} maxLength={7} onChange={e=>{setHex(e.target.value);if(/^#[0-9a-f]{6}$/i.test(e.target.value))choose(e.target.value);}} onBlur={()=>setHex(color)} placeholder="#RRGGBB" spellCheck={false}/></label><button type="button" className="secondary-button small" onClick={onPick} aria-pressed={picking}>{picking?"색상 추출 취소":"스포이드"}</button></div>
    {recent.length>0&&<div className="drawing-colors" role="group" aria-label="최근 사용 색상"><small>최근 색상</small>{recent.map(c=><button type="button" key={c} style={{backgroundColor:c}} aria-label={`최근 ${c} 색상`} onClick={()=>choose(c)}/>)}</div>}
    <details className="drawing-preset-colors"><summary>빠른 색상 32개</summary><div className="drawing-colors" role="group" aria-label="확장 색상 팔레트">{DRAWING_COLORS.map(c=><button key={c} type="button" className={color.toLowerCase()===c.toLowerCase()?"active":""} style={{backgroundColor:c}} onClick={()=>choose(c)} aria-label={`${c} 색상`} aria-pressed={color.toLowerCase()===c.toLowerCase()}/>)}</div></details>
    <label className="drawing-width-slider">굵기 {width}px <input type="range" min="2" max="36" value={width} onChange={e=>onWidth(Number(e.target.value))}/></label>
    {picking&&<small role="status">예시 또는 내 캔버스를 눌러 색상을 가져오세요.</small>}
  </div>;
}
