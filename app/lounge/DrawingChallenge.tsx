"use client";

import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { emitCharacterReaction } from "./service";
import { getDailyDrawingChallenge, koreanDateKey } from "./drawingChallenges";
import { type DrawingGrade } from "./drawingGrade";
import { scoreInWorker } from "./drawingScorer";
import { DrawingColorTools } from "./DrawingColorTools";
import { DrawingResult } from "./DrawingResult";
import { DrawingVotes } from "./DrawingVotingPanel";
import { DrawingReference } from "./DrawingReference";
import type { DrawingSubmission } from "./types";

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 360;
const PEN_WIDTHS = [5, 9, 14] as const;


type DrawPoint = { x: number; y: number };
type DrawingTool = "pen" | "marker" | "eraser";
type Stroke = { points: DrawPoint[]; width: number; color: string; tool: DrawingTool; opacity?: number };

type DrawingChallengeProps = {
  memberId: string;
  members: { id: string; name: string }[];
  submissions: DrawingSubmission[];
  onSubmit: (date: string, challengeId: string, imageDataUrl: string, score: number, grading?: DrawingGrade) => { accepted: boolean; granted: number };
};

export function DrawingChallenge({ memberId, members, submissions, onSubmit }: DrawingChallengeProps) {
  const scoringWorkerRef = useRef<Worker | null>(null);
  const scoringGeneration = useRef(0);
  useEffect(() => {
    try { scoringWorkerRef.current = new Worker(new URL("./drawingScoring.worker.ts", import.meta.url)); } catch { /* Use the same local scorer if workers are unavailable. */ }
    return () => { scoringGeneration.current++; scoringWorkerRef.current?.terminate(); scoringWorkerRef.current = null; };
  }, []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const submittingRef = useRef(false);
  const submitCallbackRef = useRef(onSubmit);
  submitCallbackRef.current = onSubmit;
  const [grading, setGrading] = useState<DrawingGrade | undefined>();
  const [isGrading, setIsGrading] = useState(false);
  const strokesRef = useRef<Stroke[]>([]);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [grantedExp, setGrantedExp] = useState(0);
  const [penWidth, setPenWidth] = useState<number>(PEN_WIDTHS[1]);
  const [penColor, setPenColor] = useState<string>("#172033");
  const [pickingColor,setPickingColor]=useState(false);
  const [redoCount,setRedoCount]=useState(0);
  const redoRef=useRef<Stroke[]>([]);
  const [brushOpacity,setBrushOpacity]=useState(70);
  const [drawingTool, setDrawingTool] = useState<DrawingTool>("pen");
  const [hasDrawing, setHasDrawing] = useState(false);
  const [dateKey, setDateKey] = useState(koreanDateKey);
  const [reference, setReference] = useState<{ id: string; binary: Uint8Array; imageDataUrl: string } | null>(null);
  const challenge = useMemo(() => getDailyDrawingChallenge(dateKey), [dateKey]);
  const todaySubmissions = useMemo(() => submissions
    .filter((item) => item.date === dateKey)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt)), [submissions, dateKey]);
  const currentSubmission = submissions.find((item) => item.memberId === memberId && item.date === dateKey);

  useEffect(() => {
    const updateDate = () => setDateKey(koreanDateKey());
    const timer = window.setInterval(updateDate, 60_000);
    window.addEventListener("focus", updateDate);
    document.addEventListener("visibilitychange", updateDate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", updateDate);
      document.removeEventListener("visibilitychange", updateDate);
    };
  }, []);

  useEffect(() => {
    scoringGeneration.current++;
    submittingRef.current = false;
    setIsGrading(false);
    clearDrawing();
  }, [challenge.id, memberId]);

  useEffect(() => {
    if (currentSubmission) { setScore(currentSubmission.score); setGrading(currentSubmission.grading); }
  }, [currentSubmission?.id,currentSubmission?.score,currentSubmission?.grading]);


  function pointOf(event: PointerEvent<HTMLCanvasElement>): DrawPoint {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * event.currentTarget.width,
      y: ((event.clientY - bounds.top) / bounds.height) * event.currentTarget.height,
    };
  }

  function drawStroke(context: CanvasRenderingContext2D, stroke: Stroke) {
    if (stroke.points.length === 0) return;
    context.save();
    context.beginPath();
    context.moveTo(stroke.points[0].x, stroke.points[0].y);
    if (stroke.points.length === 1) context.lineTo(stroke.points[0].x + 0.01, stroke.points[0].y + 0.01);
    stroke.points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.lineWidth = stroke.tool === "eraser" ? stroke.width * 2.4 : stroke.tool === "marker" ? stroke.width * 1.5 : stroke.width;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : stroke.tool === "marker" ? "destination-over" : "source-over";
    context.globalAlpha = stroke.tool === "marker" ? stroke.opacity ?? 0.7 : 1;
    context.strokeStyle = stroke.color;
    context.stroke();
    context.closePath();
    context.restore();
  }

  function redraw() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", {willReadFrequently:true});
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    strokesRef.current.forEach((stroke) => drawStroke(context, stroke));
  }

  function resetResult() {
    setGrading(undefined);
    setScore(null);
    setGrantedExp(0);
  }

  function updateHasDrawing() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", {willReadFrequently:true});
    if (!canvas || !context) return;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 24) ink += 1;
      if (ink >= 80) break;
    }
    setHasDrawing(ink >= 80);
  }

  function chooseColor(color:string) {setPenColor(color);setPickingColor(false);if(drawingTool==="eraser")setDrawingTool("pen");}
  function sampleColor(event: PointerEvent<HTMLCanvasElement>) {
    const canvas=event.currentTarget, bounds=canvas.getBoundingClientRect();
    const x=Math.min(canvas.width-1,Math.max(0,Math.floor((event.clientX-bounds.left)/bounds.width*canvas.width)));
    const y=Math.min(canvas.height-1,Math.max(0,Math.floor((event.clientY-bounds.top)/bounds.height*canvas.height)));
    const pixel=canvas.getContext("2d")?.getImageData(x,y,1,1).data;
    if(pixel&&pixel[3]>24)chooseColor("#"+Array.from(pixel.slice(0,3)).map(v=>v.toString(16).padStart(2,"0")).join(""));
  }
  function startDrawing(event: PointerEvent<HTMLCanvasElement>) {
    if(pickingColor){sampleColor(event);return;}
    if (currentSubmission || submittingRef.current) return;
    redoRef.current=[];setRedoCount(0);
    event.currentTarget.setPointerCapture(event.pointerId);
    const stroke = { points: [pointOf(event)], width: penWidth, color: penColor, tool: drawingTool, opacity:brushOpacity/100 };
    strokesRef.current = [...strokesRef.current, stroke];
    if (drawingTool !== "eraser") setHasDrawing(true);
    activeStrokeRef.current = stroke;
    resetResult();
    redraw();
  }

  function draw(event: PointerEvent<HTMLCanvasElement>) {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    const nextStroke = { ...stroke, points: [...stroke.points, pointOf(event)] };
    strokesRef.current = strokesRef.current.map((item) => item === stroke ? nextStroke : item);
    activeStrokeRef.current = nextStroke;
    redraw();
  }

  function stopDrawing(event: PointerEvent<HTMLCanvasElement>) {
    activeStrokeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    updateHasDrawing();
  }

  function clearDrawing() {
    strokesRef.current = [];
    redoRef.current=[];setRedoCount(0);
    setHasDrawing(false);
    activeStrokeRef.current = null;
    const canvas = canvasRef.current;
    canvas?.getContext("2d", {willReadFrequently:true})?.clearRect(0, 0, canvas.width, canvas.height);
    resetResult();
  }

  function undoDrawing() {
    const undone=strokesRef.current.at(-1);
    if(undone)redoRef.current.push(undone);setRedoCount(redoRef.current.length);
    strokesRef.current = strokesRef.current.slice(0, -1);
    setHasDrawing(strokesRef.current.length > 0);
    activeStrokeRef.current = null;
    resetResult();
    redraw();
    window.requestAnimationFrame(updateHasDrawing);
  }

  function redoDrawing() {
    const restored=redoRef.current.pop();if(!restored)return;
    strokesRef.current.push(restored);setRedoCount(redoRef.current.length);resetResult();redraw();updateHasDrawing();
  }
  function scoringPixels(canvas:HTMLCanvasElement) {
    const source=document.createElement("canvas");source.width=canvas.width;source.height=canvas.height;
    const ctx=source.getContext("2d")!;
    strokesRef.current.forEach(s=>drawStroke(ctx,{...s,color:"#172033",opacity:1}));
    return ctx.getImageData(0,0,source.width,source.height);
  }
  function submissionImage(canvas: HTMLCanvasElement) {
    const output = document.createElement("canvas");
    output.width = canvas.width;
    output.height = canvas.height;
    const context = output.getContext("2d");
    if (!context) return canvas.toDataURL("image/png");
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, output.width, output.height);
    context.drawImage(canvas, 0, 0);
    return output.toDataURL("image/webp", 0.88);
  }

  async function gradeDrawing() {
    if (koreanDateKey() !== dateKey) { setDateKey(koreanDateKey()); return; }
    if (currentSubmission || submittingRef.current || !hasDrawing) return;
    if (reference?.id !== challenge.id) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", {willReadFrequently:true});
    if (!canvas || !context) return;
    const pixels = scoringPixels(canvas);
    const generation = scoringGeneration.current;
    const imageDataUrl = submissionImage(canvas);
    submittingRef.current = true;
    setIsGrading(true);
    activeStrokeRef.current = null;
    const evaluated = await scoreInWorker(scoringWorkerRef.current, pixels, challenge.referenceId ?? reference.binary, context.getImageData(0,0,canvas.width,canvas.height));
    if (generation !== scoringGeneration.current) return;
    const grade: DrawingGrade = { method: "basic", score: evaluated.score, metrics: evaluated.metrics, version: evaluated.version, rawScore:evaluated.rawScore, maskSource:evaluated.maskSource, comparison: evaluated.comparison };
    if (koreanDateKey() !== dateKey) { setIsGrading(false); submittingRef.current = false; setDateKey(koreanDateKey()); return; }
    const nextScore = grade.score;
    const result = submitCallbackRef.current(dateKey, challenge.id, imageDataUrl, nextScore, grade);
    setIsGrading(false);
    if (!result.accepted) {
      submittingRef.current = false;
      return;
    }
    setGrading(grade);
    setScore(nextScore);
    setGrantedExp(result.granted);
    const message = nextScore >= 90 ? "멋지게 완성했어요!" : nextScore >= 80 ? "특징을 잘 살렸어요!" : "좋은 도전이었어요!";
    emitCharacterReaction("drawing", message);
  }

  const difficulty = "★".repeat(challenge.difficulty) + "☆".repeat(5 - challenge.difficulty);

  return (
    <div className="drawing-challenge-group">
    <section className="panel lounge-drawing-panel">
      <div className="challenge-heading">
        <div>
          <span className="lounge-eyebrow">TODAY&apos;S CHALLENGE</span>
          <h2>오늘의 드로잉</h2>
        </div>
        <span className="challenge-day">DAY {dateKey.slice(-2)}</span>
      </div>

      <div className={`drawing-layout${currentSubmission?" is-submitted":""}`}>
        <aside className="drawing-reference">
          <span>{dateKey.replaceAll("-", ".")}</span>
          <DrawingReference id={challenge.id} asset={challenge.asset} tile={challenge.tile} name={challenge.name} onReady={setReference} pickingColor={pickingColor} onSample={sampleColor} />
          <div>
            <small>오늘은</small>
            <strong>{challenge.name}</strong>
            <span className="drawing-difficulty" aria-label={`난이도 ${challenge.difficultyLabel}`}>{challenge.difficultyLabel} · {difficulty}</span>
            <p>예시를 보고 특징을 최대한 비슷하게 그려보세요.</p>
          </div>
        </aside>
        <div className="drawing-controls">
          {!currentSubmission ? <div className="drawing-toolbar" aria-label="드로잉 도구">
            <div className="drawing-tool-options" role="group" aria-label="그리기 도구">
              <button type="button" className={drawingTool === "pen" ? "active" : ""} onClick={() => setDrawingTool("pen")}>펜</button>
              <button type="button" className={drawingTool === "marker" ? "active" : ""} onClick={() => setDrawingTool("marker")}>색칠 브러시</button>
              <button type="button" className={drawingTool === "eraser" ? "active" : ""} onClick={() => setDrawingTool("eraser")}>지우개</button>
            </div>
            <div className="pen-options" role="group" aria-label="펜 굵기">
              <span>펜 굵기</span>
              {PEN_WIDTHS.map((width, index) => (
                <button key={width} type="button" className={penWidth === width ? "active" : ""} onClick={() => setPenWidth(width)} aria-label={`${index + 1}단계 펜 굵기`}>
                  <i style={{ width: index * 3 + 4, height: index * 3 + 4 }} />
                </button>
              ))}
            </div>
            <DrawingColorTools color={penColor} onColor={chooseColor} width={penWidth} onWidth={setPenWidth} picking={pickingColor} onPick={()=>setPickingColor(!pickingColor)}/>
            {drawingTool==="marker"&&<label className="drawing-width-slider">색칠 농도 {brushOpacity}% <input aria-label="색칠 농도" type="range" min="10" max="100" value={brushOpacity} onChange={e=>setBrushOpacity(Number(e.target.value))}/></label>}
            <small>펜·색칠 브러시 모두 윤곽 채점 · 색칠 브러시는 선 뒤에 칠해요 · 흰색은 흰 배경에서 보이지 않을 수 있어요.</small>
          </div> : null}
        </div>
        <div className={`drawing-workspace${currentSubmission?" submitted":""}`}>
          {currentSubmission ? (
            <div className="submitted-drawing-wrap">
              <div className="submitted-drawing" aria-label="오늘 제출한 그림"><img src={currentSubmission.imageDataUrl} alt="오늘 제출한 드로잉" /></div>
              <span className="submitted-drawing-caption">오늘 참여 완료 · {currentSubmission.score}점</span>
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              className={drawingTool === "eraser" ? "eraser" : ""}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              aria-label="드로잉 캔버스"
              tabIndex={0}
              onKeyDown={event=>{if((event.ctrlKey||event.metaKey)&&!currentSubmission&&!isGrading){if(event.key.toLowerCase()==="z"){event.preventDefault();if(event.shiftKey)redoDrawing();else undoDrawing();}else if(event.key.toLowerCase()==="y"){event.preventDefault();redoDrawing();}}}}
              onPointerDown={startDrawing}
              onPointerMove={draw}
              onPointerUp={stopDrawing}
              onPointerCancel={stopDrawing}
            />
          )}
          <div className="drawing-actions">
            {currentSubmission ? <span className="drawing-once-note">드로잉은 하루에 한 번 참여할 수 있어요.</span> : (
              <>
                <button type="button" className="secondary-button" onClick={undoDrawing} disabled={isGrading}>되돌리기</button>
                <button type="button" className="secondary-button" onClick={redoDrawing} disabled={isGrading || redoCount===0}>다시 실행</button>
                <button type="button" className="secondary-button" onClick={clearDrawing} disabled={isGrading}>전체 지우기</button>
                <button type="button" className="primary-button" onClick={gradeDrawing} disabled={isGrading || !hasDrawing || reference?.id !== challenge.id}>{isGrading ? "채점 중…" : "채점하기"}</button>
              </>
            )}
          </div>
          {score !== null ? <DrawingResult score={score} grantedExp={grantedExp} grading={grading} /> : null}
        </div>


      </div>

    </section>
      <DrawingVotes key={`${memberId}:${dateKey}`} memberId={memberId} date={dateKey} members={members} submissions={todaySubmissions}/>
    </div>
  );
}
