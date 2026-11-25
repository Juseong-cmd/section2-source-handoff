"use client";
import { useEffect, useRef, useState } from "react";
import {distanceTransform, unpackMask} from "./drawingSimilarity";
import type {DrawingGrade} from "./drawingGrade";
export function DrawingComparison({comparison}: {comparison: NonNullable<DrawingGrade["comparison"]>}) {
  const [open,setOpen]=useState(false);
  const canvas=useRef<HTMLCanvasElement>(null);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    if(!open) return;
    try {
      const {size}=comparison, ref=unpackMask(comparison.reference,size), user=unpackMask(comparison.drawing,size);
      const dr=distanceTransform(ref,size),du=distanceTransform(user,size);
      const context=canvas.current?.getContext("2d");if(!context)return;
      const theme=getComputedStyle(document.documentElement);
      const rgb=(token:string)=>{context.fillStyle=theme.getPropertyValue(token).trim();context.fillRect(0,0,1,1);return Array.from(context.getImageData(0,0,1,1).data).slice(0,3);};
      const missingColor=rgb("--feedback-missing"),extraColor=rgb("--feedback-extra"),matchColor=rgb("--feedback-match"),surfaceColor=rgb("--surface");
      const pixels=context.createImageData(size,size);
      for(let i=0;i<ref.length;i++) {
        const missing=ref[i]&&du[i]>size*0.02, extra=user[i]&&dr[i]>size*0.02;
        const color=missing?missingColor:extra?extraColor:ref[i]||user[i]?matchColor:surfaceColor;
        pixels.data.set([...color,255],i*4);
      }
      context.putImageData(pixels,0,0);setFailed(false);
    } catch {setFailed(true);}
  },[open,comparison]);
  return <div className="drawing-comparison"><button type="button" className="secondary-button" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?"비교 그림 접기":"감점 위치 보기"}</button>
    {open&&<><p>크기·위치를 맞춘 윤곽 비교입니다. <span className="drawing-comparison-missing">빨강: 빠지거나 멀어진 예시 선</span> · <span className="drawing-comparison-extra">파랑: 예시에서 벗어난 내 선</span> · 회색: 가까운 선</p>{failed?<p>이 비교 그림을 표시할 수 없습니다.</p>:<canvas ref={canvas} width={128} height={128} aria-label="누락된 선과 벗어난 선 비교" role="img"/>}</>}
  </div>;
}
