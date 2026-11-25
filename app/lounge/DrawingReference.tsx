"use client";

import { useEffect, useRef, useState } from "react";
import { referenceFromArtwork } from "./drawingSimilarity";
import { artworkRegion } from "./drawingArtwork";

const PREVIEW_SIZE = 320;
export function DrawingReference({ id, asset, tile, name, onReady, pickingColor, onSample }: {
  pickingColor?: boolean; onSample?: (event: React.PointerEvent<HTMLCanvasElement>)=>void;
  id: string; asset: string; tile?: number; name: string;
  onReady: (value: { id: string; binary: Uint8Array; imageDataUrl: string } | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    onReady(null);
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      try {
        const context = canvasRef.current?.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas unavailable");
        const source = document.createElement("canvas");
        source.width = image.naturalWidth;
        source.height = image.naturalHeight;
        const sourceContext = source.getContext("2d", { willReadFrequently: true });
        if (!sourceContext) throw new Error("Canvas unavailable");
        sourceContext.drawImage(image, 0, 0);
        const region = tile === undefined ? { x: 0, y: 0, width: source.width, height: source.height } : artworkRegion(sourceContext.getImageData(0, 0, source.width, source.height), tile);
        const scale = (PREVIEW_SIZE - 16) / Math.max(region.width, region.height);
        const width = region.width * scale, height = region.height * scale;
        context.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
        context.fillStyle = "white";
        context.fillRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
        context.drawImage(image, region.x, region.y, region.width, region.height, (PREVIEW_SIZE - width) / 2, (PREVIEW_SIZE - height) / 2, width, height);
        const binary = referenceFromArtwork(context.getImageData(0, 0, PREVIEW_SIZE, PREVIEW_SIZE));
        if (!binary.some(Boolean)) throw new Error("Empty reference");
        onReady({ id, binary, imageDataUrl: canvasRef.current!.toDataURL("image/png") });
      } catch { setFailed(true); }
    };
    image.onerror = () => { if (!cancelled) setFailed(true); };
    image.src = asset;
    return () => { cancelled = true; };
  }, [id, asset, tile, onReady, attempt]);
  return <>
    <canvas onPointerDown={pickingColor?onSample:undefined} style={{cursor:pickingColor?"crosshair":undefined}} className="drawing-reference-art" ref={canvasRef} width={PREVIEW_SIZE} height={PREVIEW_SIZE} role="img" aria-label={`${name} 드로잉 참고 이미지`} />
    {failed && <p role="alert">예시를 불러오지 못했습니다. <button type="button" onClick={() => setAttempt(value => value + 1)}>다시 불러오기</button></p>}
  </>;
}
