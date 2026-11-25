// Browser tests use intercepted local API responses. No production writes.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import ts from "typescript";
import {drawingMask,unpackMask,similarityScore} from "../app/lounge/drawingSimilarity.ts";
import { initialData } from "../app/data.ts";
import { applyRecordOperations } from "../app/state-operations.ts";
import { drawingExamples } from "../app/lounge/drawingCatalog.ts";
import { getDailyDrawingChallenge } from "../app/lounge/drawingChallenges.ts";

const origin = process.env.TEST_ORIGIN ?? "http://localhost:3034";
const server = process.env.TEST_ORIGIN ? null : spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3034"], { stdio: ["ignore", "pipe", "pipe"] });
let output = "";
server?.stdout.on("data", d => output += d);
server?.stderr.on("data", d => output += d);
let browser;
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    if ((server && server.exitCode !== null) || i === 79) throw new Error(output);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const { chromium } = await import("playwright");
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
  let data = { ...structuredClone(initialData), members: [{ id: "test-1", name: "검증사용자", color: "#1428a0", active: true }], characterProfiles: [{ memberId: "test-1", characterId: "rabbit", level: 1, exp: 0, expVersion: 2 }], drawingSubmissions: [], dailyCharacterExp: [] };
  let archiveImage="";
  let archiveGate=null;
  let archiveMode="data";
  let voteSelected = null;
  let voteRevision = 0;
  let additionalVotes={};
  let aiRequests = 0;
  let scoringWorkers = 0;
  await context.route("**/api/**", async route => {
    const request = route.request();
    if (new URL(request.url()).pathname === "/api/drawing-grade") {
      aiRequests++;
      return route.fulfill({status:503,json:{error:"disabled"}});
    }
    if (new URL(request.url()).pathname === "/api/drawing-votes") {
      const query=new URL(request.url()).searchParams;
      if(query.get("view")==="history") {
        if(archiveGate)await archiveGate;
        if(archiveMode==="error")return route.fulfill({status:503,json:{error:"fixture"}});
        if(archiveMode==="empty")return route.fulfill({json:{entries:[],nextOffset:null}});
        const rows=Array.from({length:8},(_,i)=>({date:`2026-10-${28-i}`,topVotes:3,minimum:3,completed:true,winners:[{memberId:"peer-a",name:"수상이력동료",imageDataUrl:archiveImage,amount:30}]}));
        const offset=Number(query.get("offset")??0);return route.fulfill({json:{entries:rows.slice(offset,offset+6),nextOffset:offset+6<rows.length?offset+6:null}});
      }
      if (request.method() === "POST") { voteSelected=request.postDataJSON().targetId; voteRevision++; }
      return route.fulfill({json:{date:"2026-11-04",revision:voteRevision,counts:{...additionalVotes,...(voteSelected?{[voteSelected]:(additionalVotes[voteSelected]??0)+1}:{})},selected:voteSelected,rewards:[{date:"2026-11-02",amount:30,at:"2026-11-03T00:05:00Z"}],pendingDates:[],settlementStatus:{ok:true,source:"scheduled",at:"2026-11-03T00:05:00Z"},recentSettlements:[{date:"2026-11-03",completed:true,settledAt:"2026-11-04T00:05:00Z",winners:[],topVotes:2}],latest:{date:"2026-11-03",topVotes:2,winners:[],reward:30,minimum:3,completed:true}}});
    }
    if (new URL(request.url()).pathname === "/api/state") {
      if (request.method() === "POST") {
        const body = request.postDataJSON();
        data = body.operations ? applyRecordOperations(data, body.operations) : body.data;
      }
      return route.fulfill({ json: { data, updatedAt: new Date().toISOString() } });
    }
    return route.fulfill({ json: { count: 1, events: [], responses: [] } });
  });
  const page = await context.newPage();
  page.on("worker", () => scoringWorkers++);
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.clock.setFixedTime(new Date("2026-11-03T00:00:00Z"));
  await page.goto(origin + "/lounge");
  await page.getByRole("button", { name: "검증사용자", exact: true }).click();
  const expected = getDailyDrawingChallenge("2026-11-03");
  await page.getByRole("img", { name: `${expected.name} 드로잉 참고 이미지`, exact: true }).waitFor();
  await page.waitForFunction(() => {
    const canvas = document.querySelector(".drawing-reference-art");
    return canvas && canvas.getContext("2d").getImageData(0, 0, 320, 320).data.some(v => v > 0);
  });
  const referenceImage = await page.locator(".drawing-reference-art").evaluate(c => c.toDataURL("image/png"));
  archiveImage=referenceImage;
  writeFileSync("/tmp/drawing-ai-reference.json", JSON.stringify({reference:referenceImage}));
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator(".lounge-drawing-panel").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/drawing-100-${width}.png`, animations: "disabled" });
    if(width===390)await page.locator(".drawing-color-tools").screenshot({path:"/tmp/design-color-tools-mobile.png"});
    await page.locator(".lounge-drawing-panel").screenshot({path:`/tmp/layout-${process.env.CAPTURE_LABEL??"current"}-${width}.png`,style:".site-header{visibility:hidden}.drawing-workspace{position:static!important}"});
    const geometry=await page.evaluate(()=>{
      const box=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
      const controls=box(document.querySelector(".drawing-controls")),workspace=box(document.querySelector(".drawing-workspace"));
      const buttons=Array.from(document.querySelectorAll(".drawing-actions button"),box);
      const ref=document.querySelector(".drawing-reference"),art=ref.querySelector("canvas");
      return {controls,workspace,buttons,reference:box(ref),art:box(art),fine:document.querySelector(".drawing-fine-colors").open};
    });
    assert.ok(geometry.art.x>=geometry.reference.x-1&&geometry.art.right<=geometry.reference.right+1,`Reference containment at ${width}`);
    if(width>=900){assert.ok(geometry.controls.right<geometry.workspace.x);assert.equal(geometry.fine,true);}
    else {assert.ok(geometry.controls.bottom<=geometry.workspace.y+1);assert.equal(geometry.fine,false);}
    const fieldAlignment=await page.evaluate(()=>[document.querySelector('.drawing-custom-color input[type="color"]'),document.querySelector('.drawing-custom-color input:not([type="color"])'),document.querySelector('.drawing-custom-color button')].map(e=>e.getBoundingClientRect().bottom));
    assert.ok(Math.max(...fieldAlignment)-Math.min(...fieldAlignment)<1,`Color field/button alignment at ${width}`);
    const rows=width<=600?[[0,1],[2,3]]:[[0,1,2,3]];
    for(const row of rows)for(const index of row){assert.ok(Math.abs(geometry.buttons[index].y-geometry.buttons[row[0]].y)<1);assert.ok(Math.abs(geometry.buttons[index].height-geometry.buttons[row[0]].height)<1);assert.ok(Math.abs(geometry.buttons[index].width-geometry.buttons[row[0]].width)<1);}

    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  if(process.env.LAYOUT_CAPTURE_ONLY==="1")throw new Error("LAYOUT_CAPTURE_COMPLETE");
  await page.setViewportSize({width:1440,height:720});
  await page.getByRole("button",{name:"채점하기",exact:true}).scrollIntoViewIfNeeded();
  const shortScreen=await page.getByRole("button",{name:"채점하기",exact:true}).boundingBox();
  assert.ok(shortScreen.y>=64&&shortScreen.y+shortScreen.height<=720,"Drawing action must remain reachable on a short desktop screen");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const canvas = page.getByLabel("드로잉 캔버스", { exact: true });
  await page.getByRole("button", { name: "3단계 펜 굵기", exact: true }).click();
  await canvas.click();
  await page.getByRole("button", { name: "채점하기", exact: true }).click();
  await page.getByText("오늘 참여 완료 · 0점", { exact: true }).waitFor();
  for (let i = 0; i < 100 && data.drawingSubmissions.length === 0; i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(data.drawingSubmissions.length, 1);
  assert.equal(data.drawingSubmissions[0].grading.method,"basic");
  assert.equal(aiRequests,0);

  assert.equal(data.drawingSubmissions[0].challengeId, expected.id);
  await page.reload();
  await page.getByText("오늘 참여 완료 · 0점", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "채점하기", exact: true }).count(), 0);
  for(const width of [1440,1024,768,390,320]) {
    await page.setViewportSize({width,height:1000});
    const bounds=await page.locator('.submitted-drawing').evaluate(e=>{const i=e.querySelector('img'),r=e.getBoundingClientRect(),b=i.getBoundingClientRect();return {frame:{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height},image:{x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height},fit:getComputedStyle(i).objectFit};});
    assert.ok(bounds.image.x>=bounds.frame.x&&bounds.image.y>=bounds.frame.y&&bounds.image.right<=bounds.frame.right+1&&bounds.image.bottom<=bounds.frame.bottom+1,`Submitted image must not overflow its frame at ${width}: ${JSON.stringify(bounds)}`);
    assert.equal(bounds.fit,'contain');
  }
  await page.setViewportSize({width:1440,height:1000});
  // A score repair for the same submission ID must update both caption and result.
  data.drawingSubmissions[0].score=87;data.drawingSubmissions[0].grading={...data.drawingSubmissions[0].grading,score:87,rawScore:64};
  await page.reload();
  if(await page.getByRole("button",{name:"검증사용자",exact:true}).count())await page.getByRole("button",{name:"검증사용자",exact:true}).click();
  await page.getByText("오늘 참여 완료 · 87점",{exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('.drawing-result-score strong')?.textContent==='87');
  console.log('PASS submitted image containment at 5 widths and repaired score is reflected after reload');

  await page.clock.setFixedTime(new Date("2026-11-04T00:00:00Z"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("img", { name: `${getDailyDrawingChallenge("2026-11-04").name} 드로잉 참고 이미지`, exact: true }).waitFor();
  await page.getByLabel("드로잉 캔버스", { exact: true }).waitFor();
  await page.getByRole("button", { name: "3단계 펜 굵기", exact: true }).click();
  await page.getByText("빠른 색상 32개",{exact:true}).click();
  if(!await page.locator(".drawing-fine-colors").evaluate(d=>d.open))await page.getByText("세밀한 색상 조절",{exact:true}).click();
  const hue=page.getByRole("slider",{name:"색상 각도",exact:true}),saturation=page.getByRole("slider",{name:"채도",exact:true}),value=page.getByRole("slider",{name:"명도",exact:true});
  await hue.focus();await hue.press("End");await saturation.focus();await saturation.press("End");await value.focus();await value.press("End");
  assert.equal(await page.getByLabel("HEX 색상 코드",{exact:true}).inputValue(),"#ff0000");
  await saturation.press("Home");assert.equal(await page.getByLabel("HEX 색상 코드",{exact:true}).inputValue(),"#ffffff");
  await value.press("Home");assert.equal(await page.getByLabel("HEX 색상 코드",{exact:true}).inputValue(),"#000000");
  await value.press("End");await saturation.press("End");assert.equal(await hue.inputValue(),"360");
  const sv=page.getByRole("slider",{name:"채도·명도 선택",exact:true});
  await sv.scrollIntoViewIfNeeded();
  const area=await sv.boundingBox();await page.touchscreen.tap(area.x+area.width/2,area.y+area.height/2);
  assert.ok((await sv.getAttribute("aria-valuetext")).includes("50%"));
  await sv.focus();await sv.press("ArrowRight");assert.equal(await sv.getAttribute("aria-valuenow"),"51");
  await sv.screenshot({path:"/tmp/drawing-color-picker.png"});
  await page.mouse.move(area.x+area.width/4,area.y+area.height/4);await page.mouse.down();
  await page.mouse.move(area.x+area.width+20,area.y+area.height+20,{steps:8});await page.mouse.up();
  assert.equal(await sv.getAttribute("aria-valuenow"),"100");
  assert.equal(await page.getByLabel("HEX 색상 코드",{exact:true}).inputValue(),"#000000");
  assert.equal(await page.getByRole("group",{name:"확장 색상 팔레트"}).getByRole("button").count(),32);
  await page.getByLabel("HEX 색상 코드",{exact:true}).fill("#FFF2A8");
  assert.equal(await page.locator('input[type="color"]').inputValue(),"#fff2a8");
  await page.getByRole("button",{name:"스포이드",exact:true}).click();
  await page.locator(".drawing-reference-art").click();
  assert.equal(await page.getByRole("button",{name:"스포이드",exact:true}).getAttribute("aria-pressed"),"false");
  await page.getByLabel("HEX 색상 코드",{exact:true}).fill("#FFF2A8");
  const bounds = await page.getByLabel("드로잉 캔버스", {exact:true}).boundingBox();
  await page.mouse.move(bounds.x+80,bounds.y+80); await page.mouse.down();
  for (const [x,y] of [[180,80],[180,180],[80,180],[80,80]]) await page.mouse.move(bounds.x+x,bounds.y+y,{steps:8});
  await page.mouse.up();
  const beforeUndo=await page.getByLabel("드로잉 캔버스",{exact:true}).evaluate(c=>Array.from(c.getContext("2d").getImageData(0,0,c.width,c.height).data));
  await page.getByRole("button",{name:"되돌리기",exact:true}).click();
  await page.getByRole("button",{name:"다시 실행",exact:true}).click();
  const afterRedo=await page.getByLabel("드로잉 캔버스",{exact:true}).evaluate(c=>Array.from(c.getContext("2d").getImageData(0,0,c.width,c.height).data));
  const changedPixels=afterRedo.filter((v,i)=>Math.abs(v-beforeUndo[i])>20).length;
  assert.ok(changedPixels/afterRedo.length<0.01,`Undo/redo pixel changes: ${changedPixels}`);
  await page.getByRole("button",{name:"색칠 브러시",exact:true}).click();
  await page.getByLabel("HEX 색상 코드",{exact:true}).fill("#A97951");
  await page.getByLabel("드로잉 캔버스",{exact:true}).click();
  await page.getByRole("button",{name:"채점하기",exact:true}).click();
  await page.locator(".lounge-drawing-panel .drawing-grade-feedback").getByText("형태 비교 채점",{exact:true}).waitFor();
  for (let i=0;i<100 && data.drawingSubmissions[0]?.date !== "2026-11-04";i++) await new Promise(r=>setTimeout(r,100));
  assert.equal(data.drawingSubmissions[0].grading.method,"basic");
  assert.equal(data.drawingSubmissions[0].grading.reason,undefined);
  assert.equal(data.drawingSubmissions[0].grading.version,"contour-v4");
  assert.equal(typeof data.drawingSubmissions[0].grading.metrics.coverage,"number");
  assert.ok(scoringWorkers > 0);
  assert.ok(data.drawingSubmissions[0].grading.comparison);
  const comparison=data.drawingSubmissions[0].grading.comparison;
  assert.equal(typeof data.drawingSubmissions[0].grading.rawScore,"number");
  assert.ok(["strokes","rendered-contour","rendered-outline"].includes(data.drawingSubmissions[0].grading.maskSource));
  await page.getByRole("button",{name:"감점 위치 보기",exact:true}).click();
  await page.getByRole("img",{name:"누락된 선과 벗어난 선 비교",exact:true}).waitFor();
  const heat=await page.getByRole("img",{name:"누락된 선과 벗어난 선 비교",exact:true}).evaluate(c=>Array.from(c.getContext("2d").getImageData(0,0,128,128).data).some(v=>v!==255));
  assert.equal(heat,true);
  assert.equal(aiRequests,0);
  assert.equal(await page.getByText(/AI 연결|응답 오류|AI 채점/).count(),0);
  const expAfter = JSON.stringify(data.dailyCharacterExp);
  await page.reload();
  await page.getByRole("button",{name:"검증사용자",exact:true}).click();
  await page.locator(".lounge-drawing-panel .drawing-grade-feedback").getByText("형태 비교 채점",{exact:true}).waitFor();
  assert.equal(JSON.stringify(data.dailyCharacterExp),expAfter);
  await page.setViewportSize({width:390,height:1000});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
  assert.deepEqual(errors, []);

  data.members.push({id:"peer-a",name:"투표동료A",color:"#1428a0",active:true},{id:"peer-b",name:"투표동료B",color:"#1428a0",active:true});
  for (const [i,id] of ["peer-a","peer-b"].entries()) data.drawingSubmissions.push({id:`draw-${id}`,memberId:id,date:"2026-11-04",challengeId:"fixture",imageDataUrl:referenceImage,score:70,createdAt:`2026-11-04T01:00:0${i}Z`});
  await page.reload();
  if (await page.getByRole("button",{name:"검증사용자",exact:true}).count()) await page.getByRole("button",{name:"검증사용자",exact:true}).click();
  await page.getByRole("button",{name:"내 작품에는 투표할 수 없어요"}).waitFor();
  assert.equal(await page.getByRole("button",{name:"내 작품에는 투표할 수 없어요"}).isDisabled(),true);

  assert.equal(await page.locator(".drawing-team-voting .is-leading").count(),0);
  await page.getByRole("button",{name:"투표동료A 작품에 투표",exact:true}).click();
  await page.getByRole("button",{name:"투표동료A 투표한 작품",exact:true}).waitFor();
  assert.equal(voteSelected,"peer-a");
  const cardA=page.getByRole("article",{name:"투표동료A 투표 카드",exact:true});
  await page.waitForFunction(()=>document.querySelector('[aria-label="투표동료A 투표 카드"]')?.classList.contains('is-leading'));
  assert.equal(await page.locator('.drawing-team-voting .is-leading').count(),1);
  await cardA.getByText('현재 최다 득표',{exact:true}).waitFor();
  const highlight=await cardA.evaluate(e=>({background:getComputedStyle(e).backgroundColor,badge:getComputedStyle(e.querySelector('.drawing-leader-badge')).backgroundColor,badgeText:getComputedStyle(e.querySelector('.drawing-leader-badge')).color,layer:getComputedStyle(e,'::before').zIndex}));
  assert.equal(highlight.background,'rgb(234, 237, 249)');
  assert.equal(highlight.badge,'rgb(20, 40, 160)');assert.equal(highlight.badgeText,'rgb(255, 255, 255)');assert.equal(highlight.layer,'0');
  assert.equal(await cardA.locator('.drawing-vote-count').textContent(),'1표');
  await cardA.screenshot({path:'/tmp/drawing-leader-card.png',animations:'disabled'});
  const normalAnimation=await cardA.evaluate(e=>getComputedStyle(e,"::before").animationName);assert.equal(normalAnimation,'drawing-leader-glow');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await cardA.evaluate(e=>getComputedStyle(e,'::before').animationName),'none');
  assert.equal(await cardA.locator('.drawing-vote-preview').evaluate(e=>getComputedStyle(e,'::after').display),'none');
  await page.emulateMedia({reducedMotion:'no-preference'});

  await page.getByRole("button",{name:"투표동료B 작품에 투표",exact:true}).click();
  await page.getByRole("button",{name:"투표동료B 투표한 작품",exact:true}).waitFor();assert.equal(voteSelected,"peer-b");
  assert.equal(await cardA.evaluate(e=>e.classList.contains('is-leading')),false);
  assert.equal(await page.getByRole('article',{name:'투표동료B 투표 카드',exact:true}).evaluate(e=>e.classList.contains('is-leading')),true);
  additionalVotes={'peer-a':1};
  await page.getByText('투표 정산 현황',{exact:true}).click();
  await page.getByRole('button',{name:'정산 다시 확인',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.drawing-team-voting .is-leading').length===2);
  additionalVotes={};await page.getByRole('button',{name:'정산 다시 확인',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.drawing-team-voting .is-leading').length===1);
  await page.getByText('투표 정산 현황',{exact:true}).click();
  await page.reload();
  if (await page.getByRole("button",{name:"검증사용자",exact:true}).count()) await page.getByRole("button",{name:"검증사용자",exact:true}).click();
  await page.getByText("내 투표: 투표동료B",{exact:true}).waitFor();
  await page.getByText("최다 2표 · 최소 3표 미달로 보상 없음",{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole("button",{name:"투표동료A 작품 크게 보기",exact:true}).click();
  await page.getByRole("dialog",{name:"작품 크게 보기",exact:true}).waitFor();
  assert.equal(await page.getByRole("dialog",{name:"작품 크게 보기",exact:true}).evaluate(d=>d.classList.contains("modal-card")),true);
  await page.getByRole("button",{name:"확대 보기 닫기",exact:true}).click();
  await page.getByRole("button",{name:"보상 확인",exact:true}).click();
  await page.getByText("내 투표 보상 내역",{exact:true}).click();
  await page.getByText(/2026-11-02 최다 득표/).waitFor();
  await page.getByText("투표 정산 현황",{exact:true}).click();
  await page.getByRole("button",{name:"정산 다시 확인",exact:true}).click();
  const panels=await page.evaluate(()=>[".drawing-team-voting",".drawing-vote-archive"].map(selector=>{const el=document.querySelector(selector),r=el.getBoundingClientRect(),style=getComputedStyle(el);return {padding:parseFloat(style.paddingLeft),width:r.width};}));
  assert.ok(panels.every(p=>p.padding>=16&&p.width>200),"Panels must have explicit inner padding");
  await page.getByText(/최근 예약 점검/).waitFor();
  let releaseArchive;archiveGate=new Promise(resolve=>releaseArchive=resolve);
  await page.getByRole("button",{name:"수상작 보관함 열기",exact:true}).click();
  await page.getByText('수상작을 불러오는 중…',{exact:true}).waitFor();
  assert.equal(await page.locator('.drawing-vote-archive .drawing-collection-state.loading').count(),1);
  await page.locator('.drawing-vote-archive').screenshot({path:'/tmp/drawing-archive-loading.png',animations:'disabled'});
  assert.equal(await page.getByText('수상작을 불러오는 중…',{exact:true}).evaluate(e=>getComputedStyle(e).fontSize),'14px');
  releaseArchive();archiveGate=null;
  const archive=page.getByRole("region",{name:"날짜별 수상작 보관함",exact:true});
  await archive.getByRole("img",{name:"2026-10-28 수상작 수상이력동료",exact:true}).waitFor();
  await page.getByRole("button",{name:"이전 수상작 더 보기",exact:true}).click();
  await archive.getByRole("img",{name:"2026-10-21 수상작 수상이력동료",exact:true}).waitFor();
  await page.getByRole('button',{name:'수상작 접기',exact:true}).click();archiveMode='error';
  await page.getByRole('button',{name:'수상작 보관함 열기',exact:true}).click();
  await archive.getByRole('alert').waitFor();
  assert.equal(await archive.getByRole('button',{name:'다시 시도',exact:true}).evaluate(e=>e.classList.contains('secondary-button')),true);
  archiveMode='empty';await archive.getByRole('button',{name:'다시 시도',exact:true}).click();
  await archive.getByText('아직 마감된 투표가 없어요.',{exact:true}).waitFor();
  assert.equal(await archive.locator('.drawing-collection-state.empty').count(),1);
  archiveMode='data';await page.getByRole('button',{name:'수상작 접기',exact:true}).click();

  await page.setViewportSize({width:320,height:1000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole("region",{name:"오늘의 그림 투표",exact:true}).screenshot({path:"/tmp/drawing-team-voting-mobile.png"});
  assert.equal(await page.getByRole("button",{name:"정산 다시 확인",exact:true}).evaluate(b=>b.classList.contains("secondary-button")),true);
  const tokens=await page.evaluate(()=>{const c=getComputedStyle(document.documentElement);return {space:c.getPropertyValue("--space-4").trim(),gray:c.getPropertyValue("--gray-800").trim(),radius:c.getPropertyValue("--radius-panel").trim()};});
  assert.equal(tokens.space,"16px");assert.ok(tokens.gray);assert.equal(tokens.radius,"24px");
  for(const width of [1440,1024,768,390,320]) {
    await page.setViewportSize({width,height:1000});
    const layout=await page.evaluate(()=>{
      const panelSelectors=[".lounge-drawing-panel",".drawing-team-voting",".drawing-vote-archive",".drawing-history"];
      const panels=panelSelectors.map(selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect();return {x:r.x,right:r.right,padding:parseFloat(getComputedStyle(e).paddingLeft)};});
      const cards=Array.from(document.querySelectorAll('.drawing-team-voting .drawing-vote-card')).map(e=>{const r=e.getBoundingClientRect(),b=e.querySelector('button.secondary-button').getBoundingClientRect();return {y:r.y,bottom:b.bottom,width:r.width};});
      return {panels,cards};
    });
    assert.ok(layout.panels.every(p=>Math.abs(p.x-layout.panels[0].x)<1&&Math.abs(p.right-layout.panels[0].right)<1&&p.padding===(width<=600?16:24)),`Consistent panel gutters at ${width}`);
    for(const a of layout.cards)for(const b of layout.cards)if(Math.abs(a.y-b.y)<1)assert.ok(Math.abs(a.bottom-b.bottom)<1&&Math.abs(a.width-b.width)<1,`Vote card footers align at ${width}`);
  }
  console.log("PASS layout geometry: 320/390/768/1024/1440px, reference containment, responsive controls, equal action rows, color input/button baselines, panel gutters and vote card footers; short desktop actions reachable");
  console.log("PASS design tokens and HSV UI: keyboard canonical colors, hue retained through grayscale, touch selection and fine adjustment, shared action buttons");
  console.log("PASS drawing UI: custom/pastel colors, eyedropper, undo/redo, visible brush assessment, saved heatmap, zoom, reward notice/ledger, settlement check, winner images/pagination, mobile");
  console.log("PASS voting UI: self vote disabled, one vote/change, counts, reload persistence, 3-vote minimum and mobile layout");

  const historyEntries=Array.from({length:8},(_,i)=>({id:`history-${i}`,memberId:i%2?"peer":"test-1",memberName:i%2?"동료":"검증사용자",date:`2026-10-${String(28-i).padStart(2,"0")}`,challengeId:"old",imageDataUrl:referenceImage,score:80-i,grading:{method:"basic",score:80-i,metrics:{coverage:72,precision:81,shape:64,extra:95},strengths:["이력 평가 확인"],improvements:["선 연습"],nextStep:"다시 연습해요."},createdAt:"2026-10-28T00:00:00Z"}));
  let historyRequests = 0;
  await context.route("**/api/drawing-history?**",route=>{
    historyRequests++;
    const params=new URL(route.request().url()).searchParams;const offset=Number(params.get("offset")??0);
    const filtered=historyEntries.filter(e=>!params.get("memberId")||e.memberId===params.get("memberId"));
    return route.fulfill({json:{entries:filtered.slice(offset,offset+6),nextOffset:filtered.length>offset+6?offset+6:null}});
  });
  await page.reload();
  if (await page.getByRole("button",{name:"검증사용자",exact:true}).count()) await page.getByRole("button",{name:"검증사용자",exact:true}).click();
  const history=page.getByRole("region",{name:"그림 보관함"});
  await history.getByRole("button",{name:"그림 보관함 열기",exact:true}).waitFor();
  assert.equal(historyRequests,0);
  await history.getByRole("button",{name:"그림 보관함 열기",exact:true}).click();
  await history.getByRole("button",{name:"2026-10-28 검증사용자 그림 보기"}).waitFor();
  assert.equal(await history.locator("article").count(),4);
  await history.getByRole("combobox").selectOption("all");
  await history.getByRole("button",{name:"이전 그림 더 보기"}).click();
  await history.getByRole("button",{name:"2026-10-21 동료 그림 보기"}).waitFor();
  assert.equal(await history.locator("article").count(),8);
  await history.getByRole("button",{name:"2026-10-28 검증사용자 그림 보기"}).click();
  await history.getByText("이력 평가 확인",{exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('.drawing-history-detail .drawing-result-score strong')?.textContent==='80');
  for(const width of [1440,390,320]) {
    await page.setViewportSize({width,height:1000});
    const rows=await history.locator('.drawing-metric-row').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect(),dd=e.querySelector('dd').getBoundingClientRect();return {y:r.y,bottom:r.bottom,right:r.right,scoreRight:dd.right,text:e.textContent};}));
    assert.equal(rows.length,4);
    for(let i=1;i<rows.length;i++)assert.ok(rows[i].y>=rows[i-1].bottom+7,'Metric rows must be separated');
    assert.ok(rows.every(r=>r.scoreRight<=r.right&&Math.abs(r.scoreRight-rows[0].scoreRight)<1),'Scores align right within each row');
    assert.ok(rows[0].text.includes('72')&&rows[3].text.includes('95'));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    if(width===390)await history.locator('.drawing-history-detail').screenshot({path:'/tmp/drawing-metrics-mobile.png',animations:'disabled'});
  }
  await page.setViewportSize({width:1440,height:1000});
  console.log('PASS stronger 1-vote highlight and separate metric rows/right-aligned scores at desktop/mobile widths');
  const collapse=history.getByRole('button',{name:'접기',exact:true});
  assert.equal(await collapse.evaluate(e=>e.classList.contains('secondary-button')),true);
  assert.equal(await collapse.evaluate(e=>getComputedStyle(e).fontSize),'13px');
  assert.equal(await collapse.locator('span').evaluate(e=>getComputedStyle(e).marginTop),'0px');
  assert.equal(await history.locator('.drawing-history-detail .drawing-result-score strong').evaluate(e=>getComputedStyle(e).fontSize),'20px');
  await collapse.click();assert.equal(await history.locator('.drawing-history-detail').count(),0);
  console.log('PASS live leader moves with votes, reduced-motion stops glow/glare, styled loading/error/empty states and history collapse typography');
  await page.setViewportSize({width:390,height:1000});await history.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await history.screenshot({path:"/tmp/drawing-history-mobile.png"});
  console.log("PASS history UI: mine/team filters, pagination, saved feedback and mobile layout");


  await page.setViewportSize({width:1440,height:1000});
  await page.clock.setFixedTime(new Date("2026-11-05T00:00:00Z"));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  const markerCanvas=page.getByLabel('드로잉 캔버스',{exact:true});await markerCanvas.waitFor();
  await page.getByRole('button',{name:'색칠 브러시',exact:true}).click();
  await page.getByLabel('HEX 색상 코드',{exact:true}).fill('#172033');
  const mb=await markerCanvas.boundingBox();
  await page.mouse.move(mb.x+70,mb.y+70);await page.mouse.down();
  for(const [x,y]of [[190,70],[190,190],[70,190],[70,70]])await page.mouse.move(mb.x+x,mb.y+y,{steps:10});
  await page.mouse.up();await page.getByRole('button',{name:'채점하기',exact:true}).click();
  await page.locator('.lounge-drawing-panel .drawing-grade-feedback').getByText('형태 비교 채점',{exact:true}).waitFor();
  for(let i=0;i<100&&data.drawingSubmissions[0]?.date!=='2026-11-05';i++)await new Promise(r=>setTimeout(r,100));
  assert.ok(data.drawingSubmissions[0].score>0,'Marker-only artwork must receive a nonzero assessment');
  assert.equal(data.drawingSubmissions[0].grading.version,'contour-v4');
  assert.equal(aiRequests,0);assert.deepEqual(errors,[]);
  console.log('PASS marker-only artwork is assessed without AI');


  if(process.env.RECOVERY_DRAWING_FIXTURE) {
    const recovery=JSON.parse(readFileSync(process.env.RECOVERY_DRAWING_FIXTURE,'utf8'));
    await page.clock.setFixedTime(new Date(recovery.date+'T00:00:00Z'));
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    const recoveryCanvas=page.getByLabel('드로잉 캔버스',{exact:true});await recoveryCanvas.waitFor();
    await recoveryCanvas.evaluate(async(c,src)=>{const i=new Image();i.src=src;await i.decode();c.getContext('2d').drawImage(i,0,0,c.width,c.height);c.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:99}));},recovery.imageDataUrl);
    await page.getByRole('button',{name:'채점하기',exact:true}).click();
    await page.getByText('오늘 참여 완료 · '+recovery.expectedScore+'점',{exact:true}).waitFor();
    for(let i=0;i<100&&data.drawingSubmissions[0]?.date!==recovery.date;i++)await new Promise(r=>setTimeout(r,100));
    assert.equal(data.drawingSubmissions[0].score,recovery.expectedScore);
    assert.equal(data.drawingSubmissions[0].grading.maskSource,'rendered-contour');
    const clipped=await page.locator('.submitted-drawing').evaluate(e=>{const r=e.getBoundingClientRect(),i=e.querySelector('img').getBoundingClientRect();return i.bottom>r.bottom+1;});assert.equal(clipped,false);
    console.log('PASS real incident artwork: empty stroke mask recovers expected score through browser Worker and submission; image is contained');
  }

  // Run the actual pixel extraction on all 100 atlas cells and render a QA sheet.
  const qa = await context.newPage();
  await qa.goto(origin);
  const js = ["drawingSimilarity", "drawingArtwork"].map(name => ts.transpileModule(readFileSync(`app/lounge/${name}.ts`, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText).join("\n");
  await qa.addScriptTag({ content: `var exports = {};\n${js}\nwindow.drawingQA = exports;` });
  const results = await qa.evaluate(async examples => {
    document.body.innerHTML = "";
    document.body.style.cssText = "display:grid;grid-template-columns:repeat(10,1fr);gap:8px;background:white;padding:12px;margin:0";
    const cache = new Map();
    const results = [];
    for (const example of examples) {
      let source = cache.get(example.asset);
      if (!source) {
        const image = new Image(); image.src = example.asset; await image.decode();
        source = document.createElement("canvas"); source.width = image.width; source.height = image.height;
        source.getContext("2d").drawImage(image, 0, 0); cache.set(example.asset, source);
      }
      const pixels = source.getContext("2d").getImageData(0, 0, source.width, source.height);
      const r = window.drawingQA.artworkRegion(pixels, example.tile);
      const c = document.createElement("canvas"); c.width = c.height = 320;
      const ctx = c.getContext("2d"); ctx.fillStyle = "white"; ctx.fillRect(0, 0, 320, 320);
      const scale = 304 / Math.max(r.width, r.height);
      ctx.drawImage(source, r.x, r.y, r.width, r.height, (320 - r.width * scale) / 2, (320 - r.height * scale) / 2, r.width * scale, r.height * scale);
      const binary = window.drawingQA.referenceFromArtwork(ctx.getImageData(0, 0, 320, 320));
      const card = document.createElement("div"); c.style.cssText = "width:100%;height:auto"; card.append(c);
      const label = document.createElement("p"); label.textContent = `${example.id.slice(-3)} ${example.name}`; label.style.cssText = "font:12px sans-serif;margin:0;text-align:center"; card.append(label); document.body.append(card);
      results.push({ id: example.id, points: binary.reduce((a, b) => a + b, 0), self: window.drawingQA.similarityScore(binary, binary) });
    }
    return results;
  }, drawingExamples);
  assert.equal(results.length, 100);
  assert.ok(results.every(r => r.points > 30 && r.self === 100), JSON.stringify(results.filter(r => r.points <= 30 || r.self !== 100)));
  await qa.setViewportSize({ width: 1800, height: 1200 });
  await qa.screenshot({ path: "/tmp/drawing-100-catalog.png", fullPage: true });
  console.log("PASS: 100 real assets/references; responsive canvas; dot scores 0; daily lock survives reload; KST rollover; unique daily prompt; no JS errors");
} catch(error) {
  if(error.message!=="LAYOUT_CAPTURE_COMPLETE") {
  const failedPage=browser?.contexts()[0]?.pages()[0];
  await failedPage?.screenshot({path:"/tmp/drawing-ui-failure.png",fullPage:true}).catch(()=>{});
  throw error;
  }
} finally {
  await browser?.close();
  server?.kill("SIGTERM");
  if (server && server.exitCode === null) await once(server, "exit");
}
