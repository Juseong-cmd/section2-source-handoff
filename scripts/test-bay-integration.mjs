// Runs production Next output against an in-memory PostgREST fixture. No production writes.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { initialData } from "../app/data.ts";
import { emptySchedule } from "../app/bay/model.ts";

const rows = new Map();
let failAuditOnce = "";
let failPatchOnce = "";
const site = process.env.TEST_SITE === "process" ? "process" : "section2";
const stateKey = site === "process" ? "process_main" : "main";
const prefix = `record-v2:${stateKey}:`;
const names = ["가상 팀원 1", "가상 팀원 2", "가상 팀원 3", "가상 팀원 4", "가상 팀원 5", "가상 팀원 6", "가상 팀원 7", "가상 팀원 8"];
const bayNames = ["Fusion", "Fusion", "Etch", "Etch", "Etch", "Wet", "Wet", "Wet"];
const put = (collection, id, item) => rows.set(`${prefix}${collection}:${id}`, { key: `${prefix}${collection}:${id}`, value: { schemaVersion: 2, collection, id, item, deleted: false, revision: 1, index: 0, requestId: "fixture" }, updated_at: "2026-09-27T00:00:00.000Z" });
rows.set(prefix + "__meta__", { key: prefix + "__meta__", value: { schemaVersion: 2 }, updated_at: "2026-09-27T00:00:00.000Z" });
names.forEach((name, i) => {
  put("members", `m${i}`, { id: `m${i}`, name, color: ["#1428a0", "#e7705b", "#719950"][i % 3], active: true });
  put("baySchedules", `m${i}`, { ...emptySchedule(`m${i}`), months: { "2026-09": bayNames[i] } });
});
put("absences", "away", { id: "away", memberId: "m0", startDate: "2026-09-28", endDate: "2026-09-29", type: "annual", label: "", memo: "" });
const fixture = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const matches = row => [...url.searchParams].every(([key, filter]) => {
    if (key === "or") return filter.slice(1, -1).split(",").some(clause => {
      const prefix = clause.match(/^key\.like\.(.*)\*$/)?.[1];
      return prefix && row.key.startsWith(prefix);
    });
    if (!["key", "updated_at", "value->>revision", "value->>status", "value->>id", "value->>memberId", "value->>date", "value->>closed", "value->>rewardsCompleted"].includes(key)) return true;
    const value = key.startsWith("value->>") ? String(row.value[key.slice(8)]) : row[key];
    if (filter.startsWith("eq.")) return value === filter.slice(3);
    if (filter.startsWith("in.(")) return JSON.parse(`[${filter.slice(4, -1)}]`).includes(value);
    if (filter.startsWith("lt.")) return value < filter.slice(3);
    if (filter.startsWith("like.")) return value.startsWith(filter.slice(5).replace(/%$/, ""));
    return false;
  });
  let body = ""; for await (const chunk of req) body += chunk;
  const data = body ? JSON.parse(body) : null;
  res.setHeader("Content-Type", "application/json");
  let result = [...rows.values()].filter(matches);
  if (req.method === "POST") {
    if (data.key === failAuditOnce) { failAuditOnce = ""; res.statusCode = 503; res.end("{}"); return; }
    if (rows.has(data.key) && !url.searchParams.has("on_conflict")) { res.statusCode = 409; res.end("{}"); return; }
    if (rows.has(data.key) && String(req.headers.prefer).includes("ignore-duplicates")) result = [];
    else { rows.set(data.key, data); result = [data]; }
  } else if (req.method === "PATCH") {
    if (data.key === failPatchOnce) { failPatchOnce = ""; res.statusCode = 503; res.end("{}"); return; }
    result = result.map(row => ({ ...row, ...data })); result.forEach(row => rows.set(row.key, row));
  } else if (req.method === "DELETE") { result.forEach(row => rows.delete(row.key)); result = []; }
  if (url.searchParams.get("order") === "updated_at.desc") result.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  if (url.searchParams.get("order") === "key.desc") result.sort((a,b)=>b.key.localeCompare(a.key));
  if (url.searchParams.has("offset")) result = result.slice(Number(url.searchParams.get("offset")));
  if (url.searchParams.has("limit")) result = result.slice(0, Number(url.searchParams.get("limit")));
  if (url.searchParams.get("select")?.includes("memberId:value->memberId")) {
    result = result.map(({value, updated_at}) => ({
      updated_at, memberId:value.memberId, profile:value.profile, wardrobe:value.wardrobe, daily:value.daily,
    }));
  }
  res.end(JSON.stringify(result));
});
fixture.listen(0, "127.0.0.1"); await once(fixture, "listening");
const port = 3027;
const origin = `http://localhost:${port}`;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], { env: { ...process.env, NEXT_PUBLIC_APP_SLUG: site, APP_STATE_KEY: stateKey, SUPABASE_URL: `http://127.0.0.1:${fixture.address().port}`, SUPABASE_SERVICE_ROLE_KEY: "fixture-only" }, stdio: ["ignore", "pipe", "pipe"] });
let output = ""; server.stdout.on("data", data => output += data); server.stderr.on("data", data => output += data);
const post = command => fetch(origin + "/api/bay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
const base = { kind: "base", memberId: "m1", actorId: "m2", revision: 0, requestId: "first", month: "2026-10", bay: "Wet", reason: "통합 테스트" };
let browser;
try {
  for (let n = 0; n < 80; n++) {
    try { if ((await fetch(origin + "/api/state")).ok) break; } catch {}
    if (server.exitCode !== null) throw Error(output);
    if (n === 79) throw Error("Server startup timeout: " + output);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (process.env.TEST_WARDROBE_ONLY === '1') {
    const {syncWardrobe,wardrobeItems,wardrobeCharacters}=await import('../app/lounge/wardrobe.ts');
    const {koreanDateKey}=await import('../app/lounge/drawingChallenges.ts');
    const endpoint=origin+'/api/lounge-wardrobe';
    const command=body=>fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const read=async id=>(await(await fetch(endpoint+'?memberId='+id)).json()).profile;
    const key=id=>`lounge-v1:${stateKey}:${id}`;
    put('characterProfiles','m1',{memberId:'m1',characterId:'rabbit',level:40,exp:29,expVersion:2});
    put('characterProfiles','m2',{memberId:'m2',characterId:'rabbit',level:5,exp:0,expVersion:2});
    let p=await read('m1');assert.equal(p.wardrobe.rewardedThrough,40);assert.equal(p.wardrobe.choicesSpent,0);assert.ok(p.wardrobe.owned.includes('wafer'));
    const initialRevision=rows.get(key('m1')).value.revision;await read('m1');assert.equal(rows.get(key('m1')).value.revision,initialRevision);
    assert.equal((await command({kind:'claim',memberId:'m1',itemId:'ribbon'})).status,200);
    await command({kind:'claim',memberId:'m1',itemId:'ribbon'});assert.equal((await read('m1')).wardrobe.choicesSpent,1);
    await read('m2');const race=await Promise.all(['ribbon','beret'].map(itemId=>command({kind:'claim',memberId:'m2',itemId})));
    assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);assert.equal((await read('m2')).wardrobe.choicesSpent,1);
    assert.equal((await command({kind:'equip',memberId:'m2',characterId:'rabbit',equipment:{face:'glasses'},before:{},previousCharacterId:'rabbit'})).status,409);
    p=await read('m1');const equip={kind:'equip',memberId:'m1',characterId:'rabbit',equipment:{head:'ribbon'},before:p.wardrobe.equipped.rabbit,previousCharacterId:'rabbit'};
    assert.equal((await command(equip)).status,200);
    assert.equal((await command({...equip,equipment:{}})).status,409);
    assert.equal((await command(equip)).status,200);
    const today=koreanDateKey();const vkey=`drawing-votes:v1:${stateKey}:2026-01-01`;
    rows.set(vkey,{key:vkey,value:{date:'2026-01-01',revision:1,votes:[{voterId:'m0',targetId:'m1'},{voterId:'m2',targetId:'m1'},{voterId:'m3',targetId:'m1'}],closed:false,rewardsCompleted:false},updated_at:new Date().toISOString()});
    await fetch(origin+'/api/drawing-votes?settle=1');p=await read('m1');assert.equal(p.level,41);assert.equal(p.exp,29);assert.equal(p.wardrobe.equipped.rabbit.head,'ribbon');
    const stale={memberId:'m1',characterId:'rabbit',level:1,exp:0,expVersion:2};
    const oldClient=await fetch(origin+'/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:'wardrobe-old-client',operations:[{collection:'characterProfiles',id:'m1',before:stale,after:{...stale,characterId:'dog'}},{collection:'auditLogs',id:'wardrobe-old-client',before:null,after:{id:'wardrobe-old-client',at:new Date().toISOString(),actor:names[1],action:'캐릭터 변경'}}]})});
    assert.equal(oldClient.status,200);p=await read('m1');assert.equal(p.level,41);assert.equal(p.wardrobe.equipped.rabbit.head,'ribbon');assert.equal(p.characterId,'dog');
    // A fixture-only full inventory lets every character/item compatibility pair be rendered.
    const row=rows.get(key('m1'));row.value.profile={...row.value.profile,characterId:'rabbit',level:100,exp:0};
    row.value.wardrobe=syncWardrobe(row.value.wardrobe,100,'rabbit');row.value.wardrobe.owned=wardrobeItems.map(i=>i.id);row.value.wardrobe.equipped.rabbit={head:'ribbon',face:'glasses',neck:'scarf',hand:'flower',background:'cloud'};
    const {chromium}=await import('playwright');
    browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000},hasTouch:true});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/lounge');
    await page.getByRole('button',{name:names[1],exact:true}).click();
    await page.getByRole('button',{name:/^꾸미기/}).click();const dialog=page.getByRole('dialog',{name:'나만의 꾸미기'});
    await dialog.getByText('선택권 19개',{exact:true}).waitFor();
    assert.equal(await page.locator('.character-collection').count(),0);
    for(const width of [1440,1024,768,390,320]) {
      await page.setViewportSize({width,height:800});await dialog.getByRole('button',{name:'성장 보상',exact:true}).click();
      assert.equal(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth),false,`Dialog overflow ${width}`);
      await dialog.getByRole('button',{name:'캐릭터',exact:true}).click();assert.equal(await dialog.locator('.wardrobe-grid > button').count(),10);
      const apply=dialog.getByRole('button',{name:'적용',exact:true});await apply.scrollIntoViewIfNeeded();const box=await apply.boundingBox();assert.ok(box.y>=0&&box.y+box.height<=800);
      await page.screenshot({path:`/tmp/wardrobe-${site}-${width}.png`});
    }
    await page.setViewportSize({width:1440,height:1000});await dialog.getByRole('button',{name:'내 아이템',exact:true}).click();
    for(const [label,id] of [['머리','beret'],['얼굴','glasses'],['목','scarf'],['손 소품','wand'],['배경','garden']]) {
      await dialog.getByRole('button',{name:label,exact:true}).click();const item=dialog.locator('.wardrobe-item').filter({has:page.getByText(wardrobeItems.find(i=>i.id===id).name,{exact:true})});await item.getByRole('button').click();
    }
    await dialog.getByRole('button',{name:'적용',exact:true}).click();await dialog.waitFor({state:'detached'});
    p=await read('m1');assert.equal(p.wardrobe.equipped.rabbit.head,'beret');assert.equal(p.wardrobe.equipped.rabbit.hand,'wand');
    await page.reload();if(await page.getByRole('button',{name:names[1],exact:true}).count())await page.getByRole('button',{name:names[1],exact:true}).click();
    assert.equal(await page.locator('.wardrobe-hero .slot-head').count(),1);
    await page.getByRole('button',{name:/^꾸미기/}).click();await page.getByRole('button',{name:'모두 해제',exact:true}).click();await page.getByRole('button',{name:'취소',exact:true}).click();
    assert.equal((await read('m1')).wardrobe.equipped.rabbit.head,'beret');
    await page.getByRole('button',{name:/^꾸미기/}).click();await page.getByRole('button',{name:'모두 해제',exact:true}).click();await page.getByRole('button',{name:'적용',exact:true}).click();await page.getByRole('dialog',{name:'나만의 꾸미기'}).waitFor({state:'detached'});assert.deepEqual((await read('m1')).wardrobe.equipped.rabbit,{});
    const styles=await page.locator('link[rel=stylesheet]').evaluateAll(es=>es.map(e=>e.href));
    const qa=await context.newPage();await qa.emulateMedia({reducedMotion:'reduce'});qa.on('pageerror',e=>errors.push(e.message));await qa.setContent(`<head><base href="${origin}">${styles.map(h=>`<link rel="stylesheet" href="${h}">`).join('')}</head><body></body>`);
    const fittingSets=[
      ['ribbon-flower',{head:'ribbon',face:'glasses',neck:'scarf',hand:'flower',background:'cloud'}],
      ['beret-wand',{head:'beret',face:'glasses-pink',neck:'scarf-mint',hand:'wand',background:'garden'}],
      ['blue-ribbon',{head:'ribbon-blue',background:'night'}],
      ['cleanroom',{outfit:'cleanroom',background:'peach'}],
      ['wafer',{outfit:'wafer',background:'cloud'}],
    ];
    const exhaustive=process.env.TEST_WARDROBE_EXHAUSTIVE==='1';
    if(exhaustive)fittingSets.unshift(...wardrobeItems.map(item=>['single-'+item.id,{[item.slot]:item.id}]));
    const singleRenders=[];
    for(const [label,equipment] of fittingSets) {
      const renders=[];
      for(const id of wardrobeCharacters) {
        const current=await read('m1');
        const response=await command({kind:'equip',memberId:'m1',characterId:id,equipment,before:current.wardrobe.equipped[id]??{},previousCharacterId:current.characterId});assert.equal(response.status,200);
      }
      await page.getByRole('button',{name:/^꾸미기/}).click();
      const d=page.getByRole('dialog',{name:'나만의 꾸미기'});await d.getByText('선택권 19개',{exact:true}).waitFor();await d.getByRole('button',{name:'캐릭터',exact:true}).click();
      for(let i=0;i<wardrobeCharacters.length;i++) {
        await d.locator('.wardrobe-grid > button').nth(i).click();
        assert.equal(await d.locator('.wardrobe-preview .avatar-accessory').count(),Object.keys(equipment).filter(slot=>slot!=='background'&&slot!=='outfit').length);
        const rendered={id:wardrobeCharacters[i],html:await d.locator('.wardrobe-preview .character-avatar').evaluate(e=>e.outerHTML)};
        if(equipment.background)assert.notEqual(await d.locator('.wardrobe-preview .character-avatar').evaluate(e=>getComputedStyle(e).backgroundImage),'none',`${wardrobeCharacters[i]} ${label}: preview must show selected background`);
        renders.push(rendered);if(label.startsWith('single-'))singleRenders.push({...rendered,item:label.slice(7)});
      }
      await d.getByRole('button',{name:'취소',exact:true}).click();
      for(const size of [230,92]) {
        await qa.evaluate(({renders,size})=>{document.body.innerHTML='<main style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:16px;padding:20px;background:white"></main>';const root=document.querySelector('main');for(const r of renders){const d=document.createElement('div');d.style='min-width:0;text-align:center';d.innerHTML=r.html+`<p>${r.id}</p>`;const a=d.querySelector('.character-avatar');if(size===92){a.classList.remove('interactive');a.classList.add('compact');}a.style=`width:${size}px;height:${size}px;margin:auto;animation:none`;root.append(d);}}, {renders,size});
        await qa.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
        await qa.screenshot({path:`/tmp/wardrobe-fit-${label}-${size}.png`,fullPage:true});
      }
    }
    if(exhaustive) {
      assert.equal(new Set(singleRenders.map(r=>r.id+'|'+r.item)).size,wardrobeCharacters.length*wardrobeItems.length);
      for(const id of wardrobeCharacters) {
        await qa.evaluate(({renders,items})=>{
          document.body.innerHTML='<main style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;padding:20px;background:white"></main>';const root=document.querySelector('main');
          for(const r of renders){const d=document.createElement('article');d.style='border:1px solid #ddd;border-radius:12px;padding:10px;text-align:center;min-width:0';const name=items.find(i=>i.id===r.item).name;d.innerHTML=`<strong>${name}</strong>`+r.html+r.html;const [big,small]=d.querySelectorAll('.character-avatar');big.style='width:230px;height:230px;margin:auto;animation:none';small.classList.remove('interactive');small.classList.add('compact');small.style='width:92px;height:92px;margin:auto;animation:none';root.append(d);}
        },{renders:singleRenders.filter(r=>r.id===id),items:wardrobeItems});
        await qa.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
        await qa.evaluate(()=>document.fonts.ready);await qa.screenshot({path:`/tmp/wardrobe-exhaustive-${id}.png`,fullPage:true});
      }
      console.log(`PASS exhaustive fitting: ${singleRenders.length} unique character/item pairs, 230px + actual compact 92px, plus ${fittingSets.length-wardrobeItems.length} combined outfits per character`);
    }
    // A failed apply retains the preview, and retry uses the same server intent.
    await page.getByRole('button',{name:/^꾸미기/}).click();
    await page.getByRole('button',{name:'모두 해제',exact:true}).click();
    await page.route('**/api/lounge-wardrobe',r=>r.request().method()==='POST'?r.fulfill({status:503,json:{error:'검증용 저장 실패'}}):r.continue());
    await page.getByRole('button',{name:'적용',exact:true}).click();await page.getByRole('alert').filter({hasText:'검증용 저장 실패'}).waitFor();
    assert.equal(await page.getByRole('dialog',{name:'나만의 꾸미기'}).count(),1);
    await page.unroute('**/api/lounge-wardrobe');await page.getByRole('button',{name:'적용',exact:true}).click();await page.getByRole('dialog',{name:'나만의 꾸미기'}).waitFor({state:'detached'});
    assert.deepEqual(errors,[]);console.log('PASS wardrobe server: retroactive rewards, duplicate/overspend races, unowned equipment, stale outfit conflict, vote EXP beyond 40 and old-client preservation');
    console.log('PASS wardrobe UI: 10 characters, 15 catalogue items, five widths, preview/apply/cancel/remove, persistence, reachable actions and no JS errors');
  } else if (process.env.TEST_DRAWING_VOTES_ONLY === "1") {
    const {koreanDateKey} = await import("../app/lounge/drawingChallenges.ts");
    const {totalExpRequiredForLevel} = await import("../app/lounge/utils/exp.ts");
    const today = koreanDateKey();
    const route = origin + "/api/drawing-votes";
    const cast = async (voterId,targetId,date=today) => fetch(route,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({voterId,targetId,date})});
    for (const id of ["m0","m1"]) {
      put("drawingSubmissions",id,{id:`drawing-${id}`,memberId:id,date:today,challengeId:"test",imageDataUrl:"data:image/png;base64,YQ==",score:70,createdAt:new Date().toISOString()});
      put("characterProfiles",id,{memberId:id,characterId:"rabbit",level:1,exp:0,expVersion:2});
      put("dailyCharacterExp",`${id}|${today}`,{memberId:id,date:today,amount:15});
    }
    assert.equal((await cast("m0","m0")).status,409);
    assert.equal((await cast("unknown","m0")).status,409);
    assert.equal((await cast("m2","m3")).status,409);
    assert.equal((await cast("m2","m0","2026-01-01")).status,400);
    assert.equal((await cast("m2","m0")).status,200);
    assert.equal((await cast("m2","m1")).status,200);
    let summary=await(await fetch(route+"?memberId=m2")).json();assert.equal(summary.selected,"m1");assert.equal(summary.counts.m1,1);assert.equal(summary.counts.m0,undefined);
    const concurrent=await Promise.all(["m3","m4","m5"].map(id=>cast(id,"m0")));
    assert.ok(concurrent.every(r=>r.status===200));
    summary=await(await fetch(route+"?memberId=m2")).json();assert.equal(summary.counts.m0,3);
    const seed=(date,votes)=>{const key=`drawing-votes:v1:${stateKey}:${date}`;rows.set(key,{key,value:{date,revision:1,votes:votes.map(([voterId,targetId])=>({voterId,targetId,at:date+"T00:00:00Z"})),closed:false,rewardsCompleted:false},updated_at:new Date().toISOString()});};
    seed("2026-01-01",[["m2","m0"],["m3","m0"]]);
    await fetch(route+"?settle=1");
    let state=await(await fetch(origin+"/api/state")).json();
    const total=id=>{const p=state.data.characterProfiles.find(p=>p.memberId===id);return totalExpRequiredForLevel(p.level)+p.exp;};
    assert.equal(total("m0"),0);assert.deepEqual(rows.get(`drawing-votes:v1:${stateKey}:2026-01-01`).value.result.winners,[]);
    seed("2026-01-02",[["m2","m0"],["m3","m0"],["m4","m0"],["m5","m1"],["m6","m1"],["m7","m1"]]);
    await Promise.all([1,2,3].map(()=>fetch(route+"?settle=1")));
    state=await(await fetch(origin+"/api/state")).json();assert.equal(total("m0"),30);assert.equal(total("m1"),30);
    assert.equal(state.data.dailyCharacterExp.find(d=>d.memberId==="m0"&&d.date===today).amount,15);
    await fetch(route+"?settle=1");state=await(await fetch(origin+"/api/state")).json();assert.equal(total("m0"),30);assert.equal(total("m1"),30);
    assert.deepEqual(rows.get(`drawing-votes:v1:${stateKey}:2026-01-02`).value.result.winners,["m0","m1"]);
    seed("2026-01-03",[["m2","m0"],["m3","m0"],["m4","m0"],["m5","m1"],["m6","m1"],["m7","m1"]]);
    failPatchOnce=`lounge-v1:${stateKey}:m1`;
    assert.equal((await fetch(route+"?settle=1")).status,503);
    assert.equal(rows.get(`drawing-votes:v1:${stateKey}:2026-01-03`).value.rewardsCompleted,false);
    const failedSummary=await(await fetch(route+"?memberId=m0")).json();
    assert.equal(failedSummary.settlementStatus.ok,false);assert.ok(failedSummary.pendingDates.includes("2026-01-03"));
    assert.equal((await fetch(route+"?settle=1")).status,200);
    state=await(await fetch(origin+"/api/state")).json();assert.equal(total("m0"),60);assert.equal(total("m1"),60);
    const staleProfile={memberId:"m0",characterId:"rabbit",level:1,exp:0,expVersion:2};
    const change=await fetch(origin+"/api/state",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requestId:"stale-vote-reward",operations:[{collection:"characterProfiles",id:"m0",before:staleProfile,after:{...staleProfile,characterId:"dog"}},{collection:"auditLogs",id:"vote-stale-change",before:null,after:{id:"vote-stale-change",at:new Date().toISOString(),actor:"가상 팀원 1",action:"캐릭터 변경"}}]})});
    assert.equal(change.status,200);state=await change.json();assert.equal(total("m0"),60);assert.equal(state.data.characterProfiles.find(p=>p.memberId==="m0").characterId,"dog");
    assert.deepEqual(rows.get(`lounge-v1:${stateKey}:m0`).value.drawingVoteRewards,["2026-01-02","2026-01-03"]);

    let ledger=await(await fetch(route+"?memberId=m0")).json();
    assert.equal(ledger.rewards.length,2);assert.equal(ledger.rewards[0].amount,30);assert.equal(ledger.settlementStatus.ok,true);
    const archiveKey=`drawing-history:v1:${stateKey}:2026-01-03:m0`;
    rows.set(archiveKey,{key:archiveKey,value:{memberId:"m0",date:"2026-01-03",imageDataUrl:"data:image/png;base64,YQ==",memberName:"보관이름"},updated_at:new Date().toISOString()});
    const originalMember=state.data.members.find(m=>m.id==="m0");
    put("members","m0",{...originalMember,name:"변경된이름"});
    const archive=await(await fetch(route+"?view=history")).json();
    assert.equal(archive.entries[0].date,"2026-01-03");assert.equal(archive.entries[0].winners.find(w=>w.memberId==="m0").name,"가상 팀원 1");
    assert.equal(archive.entries[0].winners.find(w=>w.memberId==="m0").imageDataUrl,"data:image/png;base64,YQ==");
    assert.equal(archive.entries[0].winners.find(w=>w.memberId==="m0").amount,30);
    assert.equal((await fetch(route+"?view=history&offset=-1")).status,400);
    put("characterProfiles","m2",{memberId:"m2",characterId:"rabbit",level:40,exp:0,expVersion:2});
    seed("2026-01-04",[["m3","m2"],["m4","m2"],["m5","m2"]]);
    await fetch(route+"?settle=1",{headers:{"User-Agent":"vercel-cron/1.0"}});
    ledger=await(await fetch(route+"?memberId=m2")).json();assert.equal(ledger.rewards[0].amount,30);assert.equal(ledger.settlementStatus.source,"scheduled");
    assert.equal(rows.get(`drawing-votes:v1:${stateKey}:2026-01-04`).value.payouts.m2.amount,30);
    const scheduledAt=ledger.scheduledStatus.at;
    await fetch(route+"?settle=1");
    ledger=await(await fetch(route+"?memberId=m2")).json();
    assert.equal(ledger.settlementStatus.source,"manual");assert.equal(ledger.scheduledStatus.at,scheduledAt);
    console.log(`PASS ${site}: reward receipts and cap, pending/failure/cron status, immutable winner names and archived images, history validation`);
    console.log(`PASS ${site}: interrupted multi-winner payout resumes without duplicate EXP; stale profile save preserves reward and marker`);
    console.log(`PASS ${site}: self/unknown/non-submitted/past votes blocked; change and concurrent votes; two votes no reward; three-vote tie +30 each beyond daily cap; concurrent/repeated settlement exactly once`);
  } else if (process.env.TEST_LOUNGE_ATOMIC_ONLY === "1") {
    const profile = {memberId:"m0",characterId:"dog",level:2,exp:6,expVersion:2};
    put("characterProfiles","m0",profile);
    const oldDay={memberId:"m0",date:"2026-10-21",amount:2};put("dailyCharacterExp","m0|2026-10-21",oldDay);
    const oldLog={id:"old-absence",at:"2026-10-20T23:14:03Z",actor:"가상 팀원 1",action:"부재 등록: 가상 팀원 1 2026-11-09~2026-11-09"};put("auditLogs",oldLog.id,oldLog);
    const oldAbs={id:"old-abs",memberId:"m0",startDate:"2026-11-09",endDate:"2026-11-09",type:"training",label:"교육",memo:"",flexTime:""};put("absences",oldAbs.id,oldAbs);
    const pending=[{collection:"absences",id:oldAbs.id,before:null,after:oldAbs},{collection:"characterProfiles",id:"m0",before:{...profile,exp:20,level:1},after:{...profile,exp:0}},{collection:"dailyCharacterExp",id:"m0|2026-10-21",before:null,after:oldDay},{collection:"auditLogs",id:oldLog.id,before:null,after:oldLog}];
    const save=async (operations,requestId)=>{const r=await fetch(origin+"/api/state",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({operations,requestId})});return {status:r.status,body:await r.json()};};
    let r=await save(pending,"recovered-old");assert.equal(r.status,200);assert.equal(r.body.data.characterProfiles.find(p=>p.memberId==="m0").exp,6);
    const draw={id:"drawing-m0-2026-11-03",memberId:"m0",date:"2026-11-03",challengeId:"test",imageDataUrl:"data:image/png;base64,YQ==",score:80,createdAt:"2026-11-03T11:28:00Z"};
    const drawLog={id:"new-draw",at:draw.createdAt,actor:"가상 팀원 1",action:"드로잉 제출"};
    const mixed=[...pending,{collection:"dailyCharacterExp",id:"m0|2026-11-03",before:null,after:{memberId:"m0",date:"2026-11-03",amount:7}},{collection:"drawingSubmissions",id:"m0",before:null,after:draw},{collection:"auditLogs",id:drawLog.id,before:null,after:drawLog}];
    failAuditOnce=prefix+"auditLogs:"+drawLog.id;
    r=await save(mixed,"partial-after-atomic");assert.equal(r.status,503);
    let state=await(await fetch(origin+"/api/state")).json();assert.equal(state.data.characterProfiles.find(p=>p.memberId==="m0").exp,13);assert.equal(state.data.drawingSubmissions.find(p=>p.memberId==="m0").score,80);
    r=await save(mixed,"reload-new-request-id");assert.equal(r.status,200);assert.equal(r.body.data.characterProfiles.find(p=>p.memberId==="m0").exp,13);
    const schedule=id=>[{collection:"characterProfiles",id:"m0",before:{...profile,exp:13},after:{...profile,exp:15}},{collection:"dailyCharacterExp",id:"m0|2026-11-03",before:{memberId:"m0",date:"2026-11-03",amount:7},after:{memberId:"m0",date:"2026-11-03",amount:9}},{collection:"auditLogs",id,before:null,after:{id,at:"2026-11-03T11:30:00Z",actor:"가상 팀원 1",action:"부재 등록: 가상 팀원 1 2026-11-10~2026-11-10"}}];
    const concurrent=await Promise.all([save(schedule("schedule-a"),"a"),save(schedule("schedule-b"),"b")]);assert.ok(concurrent.every(x=>x.status===200));
    state=await(await fetch(origin+"/api/state")).json();assert.equal(state.data.characterProfiles.find(p=>p.memberId==="m0").exp,17);assert.equal(state.data.dailyCharacterExp.find(d=>d.memberId==="m0"&&d.date==="2026-11-03").amount,11);
    await save(schedule("schedule-a"),"replay");state=await(await fetch(origin+"/api/state")).json();assert.equal(state.data.characterProfiles.find(p=>p.memberId==="m0").exp,17);
    const duplicate=mixed.filter(op=>!["absences"].includes(op.collection)).map(op=>op.collection==="auditLogs"&&op.id==="new-draw"?{...op,id:"second-tab-draw",after:{...op.after,id:"second-tab-draw"}}:op);
    r=await save(duplicate,"duplicate-tab");assert.equal(r.status,200);assert.equal(r.body.data.characterProfiles.find(p=>p.memberId==="m0").exp,17);
    let history=await(await fetch(origin+"/api/drawing-history?memberId=m0")).json();
    assert.equal(history.entries.length,1);assert.equal(history.entries[0].imageDataUrl,draw.imageDataUrl);
    const later=structuredClone(mixed.filter(op=>op.collection!=="absences"));
    for(const op of later) {
      if(op.collection==="drawingSubmissions") op.after={...draw,id:"drawing-m0-2026-11-04",date:"2026-11-04",createdAt:"2026-11-04T00:00:00Z",imageDataUrl:"data:image/png;base64,Yg=="};
      if(op.collection==="auditLogs" && op.id==="new-draw") {op.id="later-draw";op.after={...op.after,id:op.id,at:"2026-11-04T00:00:00Z"};}
    }
    failAuditOnce=`drawing-history:v1:${stateKey}:2026-11-04:m0`;
    r=await save(later,"next-day");assert.equal(r.status,503);
    r=await save(later,"next-day-retry");assert.equal(r.status,200);
    history=await(await fetch(origin+"/api/drawing-history?memberId=m0")).json();assert.equal(history.entries.length,2);assert.equal(history.entries[0].date,"2026-11-04");assert.equal(history.entries[1].imageDataUrl,draw.imageDataUrl);
    assert.equal((await(await fetch(origin+"/api/drawing-history?memberId=m1")).json()).entries.length,0);
    assert.equal((await fetch(origin+"/api/drawing-history?offset=-1")).status,400);
    const deleted = r.body.data;
    const removal = [{collection:"members",id:"m0",before:deleted.members.find(m=>m.id==="m0"),after:null},
      ...["characterProfiles","dailyCharacterExp","drawingSubmissions"].flatMap(collection=>deleted[collection].filter(v=>v.memberId==="m0").map(v=>({collection,id:collection==="dailyCharacterExp"?`m0|${v.date}`:"m0",before:v,after:null})))];
    r=await save(removal,"remove-member");assert.equal(r.status,200);assert.equal(r.body.data.characterProfiles.some(p=>p.memberId==="m0"),false);assert.equal(rows.has(`lounge-v1:${stateKey}:m0`),false);
    history=await(await fetch(origin+"/api/drawing-history?memberId=m0")).json();assert.equal(history.entries.length,2);assert.equal(history.entries[0].memberName,"가상 팀원 1");
    for(let n=1;n<=7;n++){const key=`drawing-history:v1:${stateKey}:2026-10-0${n}:m1`;rows.set(key,{key,value:{...draw,id:`history-${n}`,memberId:"m1",memberName:"동료",date:`2026-10-0${n}`},updated_at:new Date().toISOString()});}
    history=await(await fetch(origin+"/api/drawing-history")).json();assert.equal(history.entries.length,6);assert.equal(history.nextOffset,6);
    const nextPage=await(await fetch(origin+"/api/drawing-history?offset=6")).json();assert.equal(nextPage.entries.length,3);assert.equal(nextPage.nextOffset,null);
    assert.equal(new Set([...history.entries,...nextPage.entries].map(e=>e.id)).size,9);
    console.log(`PASS ${site}: stale incident replay, atomic drawing+EXP, interrupted audit recovery, concurrent distinct rewards, same-action and same-day drawing deduplication`);
  } else if (process.env.TEST_CALENDAR_READ_ONLY === "1") {
    const date = "2026-11-04";
    const imageDataUrl = "data:image/png;base64," + "A".repeat(160_000);
    const drawing = { id:"saved-picture", memberId:"m0", date, score:78, imageDataUrl, createdAt:date + "T12:00:00Z" };
    const profile = { memberId:"m0", characterId:"rabbit", level:4, exp:2, expVersion:2 };
    const daily = [{ memberId:"m0", date, amount:4 }];
    const loungeKey = `lounge-v1:${stateKey}:m0`;
    rows.set(loungeKey, { key:loungeKey, value:{memberId:"m0",profile,daily,drawing}, updated_at:drawing.createdAt });
    const voteKey = `drawing-votes:v1:${stateKey}:2026-11-01`;
    rows.set(voteKey, {key:voteKey,value:{date:"2026-11-01",revision:1,votes:[],closed:false,rewardsCompleted:false}});
    const response = await fetch(origin + "/api/state?view=calendar");
    assert.equal(response.status,200);
    const calendar = await response.json();
    assert.deepEqual(calendar.data.drawingSubmissions,[]);
    assert.equal(rows.get(voteKey).value.closed,false);
    assert.equal(calendar.data.characterProfiles[0].level,4);
    assert.deepEqual(calendar.data.dailyCharacterExp,daily);
    const full = await (await fetch(origin + "/api/state")).json();
    assert.equal(full.data.drawingSubmissions[0].imageDataUrl,imageDataUrl);
    assert.equal(rows.get(voteKey).value.closed,false);
    const archiveKey = `drawing-history:v1:${stateKey}:${date}:m0`;
    assert.equal((await (await fetch(origin + "/api/drawing-history?memberId=m0")).json()).entries.length,0);
    assert.equal(rows.has(archiveKey),false);
    const backup = await fetch(origin + "/api/backup", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({force:true})});
    assert.equal(backup.status,200);
    assert.equal(rows.get(archiveKey).value.imageDataUrl,imageDataUrl);
    assert.equal((await (await fetch(origin + "/api/drawing-history?memberId=m0")).json()).entries.length,1);
    assert.deepEqual(calendar.data.absences,full.data.absences);
    assert.deepEqual(calendar.data.characterProfiles,full.data.characterProfiles);
    assert.deepEqual(calendar.data.dailyCharacterExp,full.data.dailyCharacterExp);
    console.log(`PASS ${site}: calendar omits drawings and settlement, preserves attendance, profiles and EXP (${JSON.stringify(full).length} → ${JSON.stringify(calendar).length} bytes)`);
  } else if (process.env.TEST_DRAWING_GRADE_ONLY === "1") {
    const url = origin + "/api/drawing-grade";
    for (const [path, options] of [["?worker=1"], ["", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({kind:"heartbeat"})}]]) {
      assert.equal((await fetch(url + path, options)).status, 404);
    }
    console.log(`PASS ${site}: retired drawing API does not accept worker polls or heartbeats`);
  } else if (process.env.TEST_STATE_CONFLICT_ONLY === "1") {
    const save = (operations, requestId) => fetch(origin + "/api/state", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({operations, requestId})});
    const logs = Array.from({length: 85}, (_, i) => ({id: `log-${i}`, at: new Date(Date.UTC(2026, 10, 3, 0, i)).toISOString(), actor: "test", action: "test"}));
    logs.forEach(log => put("auditLogs", log.id, log));
    let state = await (await fetch(origin + "/api/state")).json();
    assert.equal(state.data.auditLogs.length, 80);
    assert.equal(state.data.auditLogs[0].id, "log-84");
    assert.equal(state.data.auditLogs.at(-1).id, "log-5");
    const deletion = {collection: "auditLogs", id: "log-0", before: logs[0], after: null};
    assert.equal((await save([deletion], "legacy-delete")).status, 200);
    assert.equal(rows.get(prefix + "auditLogs:log-0").value.deleted, false);
    // An old log outside the visible 80 entries is retried as a creation, with JSONB key ordering.
    const reordered = {action: logs[0].action, actor: logs[0].actor, at: logs[0].at, id: logs[0].id};
    assert.equal((await save([{...deletion, before: null, after: reordered}], "hidden-replay")).status, 200);
    assert.equal(rows.get(prefix + "auditLogs:log-0").value.revision, 1);
    const first = state.data.members.find(m => m.id === "m0");
    const second = state.data.members.find(m => m.id === "m1");
    const firstChange = {collection: "members", id: first.id, before: first, after: {...first, color: "#123456"}};
    const clash = {collection: "members", id: second.id, before: {...second, color: "#000000"}, after: {...second, color: "#ffffff"}};
    const failed = await save([firstChange, clash], "partial-save");
    assert.equal(failed.status, 409);
    const body = await failed.json();
    assert.equal(body.details.collection, "members"); assert.equal(body.details.recordId, "m1");
    assert.equal(body.details.reason, "field_conflict"); assert.equal(body.details.completedOperations, 1);
    const revision = rows.get(prefix + "members:m0").value.revision;
    const completed = await save([firstChange, {...clash, before: second}], "partial-save");
    assert.equal(completed.status, 200);
    assert.equal(rows.get(prefix + "members:m0").value.revision, revision);
    state = await (await fetch(origin + "/api/state")).json();
    assert.equal(state.data.members.find(m => m.id === "m1").color, "#ffffff");
    assert.ok(logs.every(log => rows.get(prefix + "auditLogs:" + log.id).value.deleted === false));
    console.log(`PASS ${site}: 85-log stable window, legacy deletion protection, hidden-history JSONB replay, structured partial conflict and idempotent retry`);
  } else if (process.env.TEST_COMMON_RANGE_ONLY === "1") {
    const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto(origin);
    await page.getByRole("button", { name: "가상 팀원 3", exact: true }).click();
    await page.getByRole("button", { name: "+ 공통 일정", exact: true }).click();
    await page.getByLabel("공통 일정 제목").fill("기간 선택 검증");
    await page.getByLabel("시작일", { exact: true }).fill("2026-11-02");
    await page.getByLabel("종료일", { exact: true }).fill("2026-11-02");
    const header = date => page.getByRole("button", { name: `${date} 선택`, exact: true });
    async function drag(from, to) {
      const a = await header(from).boundingBox(), b = await header(to).boundingBox();
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
      await page.mouse.up();
    }
    await drag("2026-11-02", "2026-11-04");
    assert.equal(await page.getByLabel("시작일", { exact: true }).inputValue(), "2026-11-02");
    assert.equal(await page.getByLabel("종료일", { exact: true }).inputValue(), "2026-11-04");
    assert.equal(await page.locator('.common-date-select[aria-pressed="true"]').count(), 3);
    await drag("2026-11-06", "2026-11-03");
    assert.equal(await page.getByLabel("시작일", { exact: true }).inputValue(), "2026-11-03");
    assert.equal(await page.getByLabel("종료일", { exact: true }).inputValue(), "2026-11-06");
    await header("2026-11-02").click();
    await page.getByRole("button", { name: "다음 주", exact: true }).click();
    await header("2026-11-10").click({ modifiers: ["Shift"] });
    assert.equal(await page.getByLabel("시작일", { exact: true }).inputValue(), "2026-11-02");
    assert.equal(await page.getByLabel("종료일", { exact: true }).inputValue(), "2026-11-10");
    await page.getByLabel("종료일", { exact: true }).fill("2026-11-04");
    await page.getByRole("button", { name: "이전 주", exact: true }).click();
    await header("2026-11-03").focus(); await page.keyboard.press("Enter");
    assert.equal(await page.getByLabel("종료일", { exact: true }).inputValue(), "2026-11-03");
    await page.getByLabel("시작일", { exact: true }).fill("2026-11-02");
    await page.getByLabel("종료일", { exact: true }).fill("2026-11-04");
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `/tmp/common-range-${site}-${width}.png`, fullPage: true });
    }
    await page.getByRole("button", { name: "공통 일정 등록", exact: true }).click();
    await page.getByRole("heading", { name: "기간 선택 검증", exact: true }).waitFor();
    const saved = (await (await fetch(origin + "/api/common-events")).json()).events.find(e => e.title === "기간 선택 검증");
    assert.equal(saved.date, "2026-11-02"); assert.equal(saved.endDate, "2026-11-04");
    await page.getByRole("button", { name: "닫기", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "기간 선택 검증 공통 일정 열기", exact: true }).count(), 3);
    await page.reload();
    await page.getByRole("button", { name: "기간 선택 검증 공통 일정 열기", exact: true }).nth(1).click();
    await page.getByRole("button", { name: "일정 수정", exact: true }).click();
    assert.equal(await page.getByLabel("종료일", { exact: true }).inputValue(), "2026-11-04");
    await page.getByLabel("종료일", { exact: true }).fill("2026-11-03");
    await page.getByRole("button", { name: "변경 저장", exact: true }).click();
    await page.getByRole("heading", { name: "기간 선택 검증", exact: true }).waitFor();
    await page.getByRole("button", { name: "공통 일정 이력", exact: true }).click();
    assert.match(await page.locator('.common-history').innerText(), /2026-11-02 ~ 2026-11-04/);
    await page.getByRole("button", { name: "일정 취소", exact: true }).click();
    await page.getByLabel("취소 사유").fill("검증 완료");
    await page.getByRole("button", { name: "일정 취소 확정", exact: true }).click();
    await page.locator(".common-detail").getByText(/취소됨/).waitFor();
    await page.getByRole("button", { name: "닫기", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "기간 선택 검증 공통 일정 열기", exact: true }).count(), 0);
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const [from, to] of [["2026-11-04", "2026-11-06"], ["2026-11-06", "2026-11-04"]]) {
      const a = await page.locator(`.calendar-cell[aria-label^="${from}"]`).boundingBox();
      const b = await page.locator(`.calendar-cell[aria-label^="${to}"]`).boundingBox();
      await page.mouse.move(a.x + 10, a.y + 15); await page.mouse.down();
      await page.mouse.move(b.x + 10, b.y + 15, { steps: 10 }); await page.mouse.up();
      await page.getByRole("button", { name: "이 기간에 공통 일정 등록", exact: true }).click();
      assert.equal(await page.getByLabel("시작일", { exact: true }).inputValue(), "2026-11-04");
      assert.equal(await page.getByLabel("종료일", { exact: true }).inputValue(), "2026-11-06");
      if (from < to) await page.getByRole("button", { name: "닫기", exact: true }).click();
    }
    await page.getByLabel("공통 일정 제목").fill("전일 검증");
    await page.getByLabel("시간 미지정 (전일)", { exact: true }).check();
    assert.equal(await page.getByLabel("시작 시각", { exact: true }).count(), 0);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `/tmp/common-allday-${site}-${width}.png`, fullPage: true });
    }
    await page.getByRole("button", { name: "공통 일정 등록", exact: true }).click();
    await page.getByRole("heading", { name: "전일 검증", exact: true }).waitFor();
    assert.match(await page.locator('.common-detail').innerText(), /전일/);
    const allDay = (await (await fetch(origin + "/api/common-events")).json()).events.find(e => e.title === "전일 검증");
    assert.equal(allDay.allDay, true); assert.equal(allDay.start, ""); assert.equal(allDay.end, "");
    assert.equal(allDay.endDate, "2026-11-06");
    await page.getByRole("button", { name: "닫기", exact: true }).click();
    const badges = page.getByRole("button", { name: "전일 검증 공통 일정 열기", exact: true });
    assert.equal(await badges.count(), 3); assert.match(await badges.first().innerText(), /전일/);
    await page.reload();
    await badges.first().click();
    await page.getByRole("button", { name: "일정 수정", exact: true }).click();
    assert.equal(await page.getByLabel("시간 미지정 (전일)", { exact: true }).isChecked(), true);
    await page.getByLabel("시간 미지정 (전일)", { exact: true }).uncheck();
    await page.getByLabel("시작 시각", { exact: true }).fill("09:00");
    await page.getByLabel("종료 시각", { exact: true }).fill("10:00");
    await page.getByRole("button", { name: "변경 저장", exact: true }).click();
    await page.getByRole("heading", { name: "전일 검증", exact: true }).waitFor();
    assert.match(await page.locator('.common-detail').innerText(), /09:00–10:00/);
    await page.getByRole("button", { name: "공통 일정 이력", exact: true }).click();
    assert.match(await page.locator('.common-history').innerText(), /전일/);
    console.log(`PASS ${site}: month drag both directions, all-day save/reload/badges, timed conversion and history`);
    assert.deepEqual(errors, []);
    console.log(`PASS ${site}: forward/reverse drag, Shift across weeks, keyboard, range save/reload/edit/history/cancel, 1440/390 layouts`);
  } else if (site === "process") {
    assert.equal((await fetch(origin + "/api/bay")).status, 404);
    const eventPost = command => fetch(origin + "/api/common-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
    const event = { kind: "save", eventId: "process-event", actorId: "m2", revision: 0, requestId: "process-create", fields: { title: "공정 팀 중식", kind: "meal", meal: "lunch", date: "2026-10-14", start: "12:00", end: "13:00", location: "", notes: "", deadline: "", responseMode: "confirm", targetIds: names.map((_, i) => `m${i}`) } };
    assert.equal((await eventPost(event)).status, 200);
    const race = await Promise.all([eventPost({ ...event, revision: 1, requestId: "edit-1", fields: { ...event.fields, location: "A" } }), eventPost({ ...event, revision: 1, requestId: "edit-2", fields: { ...event.fields, location: "B" } })]);
    assert.deepEqual(race.map(r => r.status).sort(), [200, 409]);
    assert.ok(![...rows.keys()].some(key => key.startsWith("record-v2:main:")));
    for (let i = 0; i < 8; i++) put("absences", `dense-${i}`, { id: `dense-${i}`, memberId: `m${i}`, startDate: "2026-10-12", endDate: "2026-10-16", type: "annual", label: "", memo: "" });
    const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto(origin);
    await page.getByRole("button", { name: "가상 팀원 3", exact: true }).click();
    await page.locator(".continuous-week").first().waitFor();
    const currentMonth = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", month: "numeric" }).format(new Date()));
    for (let i = currentMonth; i !== 10; i += i < 10 ? 1 : -1) await page.getByRole("button", { name: i < 10 ? "다음 달" : "이전 달", exact: true }).click();
    assert.equal(await page.getByRole("tab", { name: "Bay 배정", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "잔업", exact: true }).count(), 0);
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await page.locator(".continuous-absence").evaluateAll(es => es.filter(e => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).length), 0);
      await page.screenshot({ path: `/tmp/process-parity-${width}.png`, fullPage: true });
    }
    await page.getByRole("button", { name: "공정 팀 중식 공통 일정 열기", exact: true }).click();
    await page.getByRole("heading", { name: "공정 팀 중식", exact: true }).waitFor();
    assert.equal(await page.getByText("미응답", { exact: true }).count(), 0);
    await page.getByRole("button", { name: "닫기", exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('.calendar-cell[aria-label^="2026-10-14"]').click();
    await page.getByRole("tab", { name: "내 일정 등록", exact: true }).click();
    assert.equal(await page.locator(".day-detail-modal").getByText("잔업", { exact: true }).count(), 0);
    await page.screenshot({ path: "/tmp/process-parity-modal.png" });
    assert.deepEqual(errors, []);
    console.log("PASS PROCESS: isolated records, common-event save/conflict, Bay disabled, no overtime controls, continuous bars, 1440/768/390/320 layouts, modal and direct event access");
  } else {
  const same = await Promise.all([post(base), post({ ...base, requestId: "second", bay: "Etch" })]);
  assert.deepEqual(same.map(r => r.status).sort(), [200, 409]);
  const winner = same[0].ok ? base : { ...base, requestId: "second", bay: "Etch" };
  assert.equal((await post(winner)).status, 200);
  const separate = await Promise.all([post({ ...base, memberId: "m2", requestId: "independent-1" }), post({ ...base, memberId: "m3", requestId: "independent-2" })]);
  assert.ok(separate.every(r => r.status === 200));
  const backup = { kind: "backup", memberId: "m4", actorId: "m2", revision: 0, requestId: "backup", start: "2026-09-28", end: "2026-09-29", bay: "Wet", reason: "지원" };
  const doubleBackup = await Promise.all([post(backup), post({ ...backup, requestId: "backup-race", bay: "Fusion" })]);
  assert.deepEqual(doubleBackup.map(r => r.status).sort(), [200, 409]);
  assert.equal((await post({ ...backup, memberId: "m0", requestId: "absent" })).status, 422);
  const state = await (await fetch(origin + "/api/state")).json();
  const legacy = await fetch(origin + "/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: { ...state.data, baySchedules: undefined }, baseData: state.data }) });
  assert.equal(legacy.status, 200); assert.equal((await legacy.json()).data.baySchedules.length, 8);
  for (const r of rows.values()) if (r.value.collection === "baySchedules") assert.equal(r.value.item.revision, r.value.item.history.length);
  console.log("PASS API: same-member CAS conflict, independent-member writes, idempotent retry, overlapping backup race, absence rejection, legacy preservation, atomic history");

  const eventPost = command => fetch(origin + "/api/common-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
  const createEvent = { kind: "save", eventId: "test-event", actorId: "m2", revision: 0, requestId: "event-create", fields: { title: "API 회의", kind: "meeting", meal: "lunch", date: "2026-09-29", start: "14:00", end: "15:00", location: "A", notes: "", deadline: "", responseMode: "confirm", targetIds: names.map((_, i) => `m${i}`) } };
  assert.equal((await eventPost(createEvent)).status, 200);
  const reply = { kind: "respond", eventId: "test-event", eventRevision: 1, revision: 0, status: "confirmed" };
  const simultaneous = await Promise.all(names.map((_, i) => eventPost({ ...reply, actorId: `m${i}`, requestId: `reply-${i}` })));
  assert.ok(simultaneous.every(r => r.status === 410));
  let commonState = await (await fetch(origin + "/api/common-events")).json();
  assert.equal(commonState.responses.length, 0);
  assert.equal((await eventPost({ ...reply, actorId: "m0", requestId: "reply-0" })).status, 410);
  assert.equal((await eventPost({ ...createEvent, actorId: "m1", revision: 1, requestId: "unauthorized" })).status, 403);
  const editRace = await Promise.all([eventPost({ ...createEvent, revision: 1, requestId: "edit-one", fields: { ...createEvent.fields, location: "B" } }), eventPost({ ...createEvent, revision: 1, requestId: "edit-two", fields: { ...createEvent.fields, location: "C" } })]);
  assert.deepEqual(editRace.map(r => r.status).sort(), [200, 409]);
  assert.equal((await eventPost({ ...reply, actorId: "m0", revision: 1, requestId: "stale-event" })).status, 410);
  commonState = await (await fetch(origin + "/api/common-events")).json();
  assert.ok(commonState.responses.every(r => r.eventRevision === 1 && r.history.length === 1));
  assert.equal(commonState.events[0].revision, 2);
  const editedState = await (await fetch(origin + "/api/state")).json();
  const oldClient = await fetch(origin + "/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: { ...editedState.data, commonEvents: undefined, commonResponses: undefined }, baseData: editedState.data }) });
  assert.equal((await oldClient.json()).data.commonEvents.length, 1);
  console.log("PASS common-event API: retired response endpoint, owner-only edit, edit conflict, legacy preservation");

  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(origin);
  await page.getByRole("button", { name: "가상 팀원 3", exact: true }).click();
  const current = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const currentMonth = Number(current.find(p => p.type === "year").value) * 12 + Number(current.find(p => p.type === "month").value);
  async function showMonth(p, month) {
    const delta = 2026 * 12 + month - currentMonth;
    for (let i = 0; i < Math.abs(delta); i++) await p.getByRole("button", { name: delta < 0 ? "이전 달" : "다음 달", exact: true }).click();
  }
  await showMonth(page, 9);
  await page.getByRole("tab", { name: "Bay 배정", exact: true }).click();
  await page.getByLabel("조회 날짜", { exact: true }).fill("2026-09-28");
  await page.getByRole("heading", { name: "Fusion", exact: true }).waitFor();
  assert.equal(await page.locator('.bay-toolbar [role="status"]').innerText(), "");
  assert.equal(await page.locator('.bay-page-switch button').first().evaluate(el => getComputedStyle(el).fontSize), "12px");
  assert.equal(await page.locator('.bay-page-switch').evaluate(el => getComputedStyle(el).borderRadius), "999px");
  assert.equal(await page.locator('.bay-person-name').first().evaluate(el => getComputedStyle(el).fontSize), "14px");
  await page.getByRole("tab", { name: "월 기본 배정", exact: true }).click();
  await page.getByRole("button", { name: "가상 팀원 8 기본 Bay 수정", exact: true }).click();
  await page.getByLabel("기본 Bay", { exact: true }).selectOption("Etch");
  await page.getByLabel("변경 사유").fill("브라우저 저장 확인");
  const concurrent = await post({ ...base, memberId: "m7", requestId: "form-conflict", month: "2026-09", bay: "Fusion" });
  assert.equal(concurrent.status, 200);
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await page.getByRole("button", { name: "최신 배정 기준으로 다시 검토", exact: true }).waitFor();
  assert.equal(await page.getByLabel("변경 사유").inputValue(), "브라우저 저장 확인");
  await page.getByRole("button", { name: "최신 배정 기준으로 다시 검토", exact: true }).click();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await page.locator("dialog.bay-dialog:not(.bay-carry)").waitFor({ state: "hidden" });
  await page.getByRole("tab", { name: "변경 이력", exact: true }).click();
  await page.getByText("브라우저 저장 확인", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "일별 현황", exact: true }).click();
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width}`);
    if (width === 390) assert.ok(await page.locator('.bay-page-switch button').first().evaluate(el => el.getBoundingClientRect().height >= 44));
    if (width === 1440 || width === 390) await page.screenshot({ path: `/tmp/bay-live-${width}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "백업 배정", exact: true }).click();
  await page.getByLabel("담당자", { exact: true }).selectOption("m5");
  await page.getByLabel("백업 Bay", { exact: true }).selectOption("Fusion");
  await page.getByLabel("변경 사유").fill("모바일 지원 테스트");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await page.locator("dialog.bay-dialog:not(.bay-carry)").waitFor({ state: "hidden" });
  await page.getByRole("tab", { name: "일정", exact: true }).click();
  assert.equal(await page.getByRole("heading", { name: "Wet", exact: true }).count(), 0);
  await page.locator('.calendar-cell.in-month').filter({ has: page.locator('.date-number').filter({ hasText: /^28$/ }) }).click();
  await page.getByRole("button", { name: "배정 보기", exact: true }).click();
  await page.getByRole("heading", { name: "Wet", exact: true }).waitFor();
  await page.getByRole("tab", { name: "일정", exact: true }).click();
  await page.getByRole("button", { name: "+ 공통 일정", exact: true }).click();
  assert.equal(await page.locator(".common-form").getByText(/응답 방식|참석 여부 조사|응답 기한/).count(), 0);
  await page.getByLabel("공통 일정 제목", { exact: true }).fill("팀 주간 회의");
  await page.getByLabel("시작일", { exact: true }).fill("2026-09-29");
  await page.getByLabel("장소 (선택)", { exact: true }).fill("회의실 A");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "/tmp/common-event-create.png", fullPage: true });
  await page.getByRole("button", { name: "공통 일정 등록", exact: true }).click();
  await page.getByRole("heading", { name: "팀 주간 회의", exact: true }).waitFor();
  assert.equal(await page.locator(".common-workspace").getByText(/미응답|내 응답|확인했어요|응답 기한|재확인/).count(), 0);
  assert.equal(await page.locator(".common-workspace .day-week-row").count(), 8);
  await page.getByText("저장되었습니다.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "일정 수정", exact: true }).click();
  await page.getByLabel("장소 (선택)", { exact: true }).fill("회의실 B");
  await page.getByRole("button", { name: "변경 저장", exact: true }).click();
  await page.getByText("저장되었습니다.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "새 일정", exact: true }).click();
  await page.getByRole("button", { name: "회식", exact: true }).click();
  await page.getByRole("group", { name: "회식 시간대", exact: true }).waitFor();
  await page.getByRole("radio", { name: "석식", exact: true }).check();
  await page.getByRole("button", { name: "회의", exact: true }).click();
  assert.equal(await page.getByRole("radio", { name: "석식", exact: true }).count(), 0);
  await page.getByRole("button", { name: "회식", exact: true }).click();
  assert.equal(await page.getByRole("radio", { name: "석식", exact: true }).isChecked(), true);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ path: `/tmp/common-meal-hierarchy-${width}.png`, animations: "disabled" });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await page.getByLabel("공통 일정 제목", { exact: true }).fill("팀 회식");
  await page.getByLabel("시작 시각", { exact: true }).fill("18:30");
  await page.getByLabel("종료 시각", { exact: true }).fill("20:00");
  await page.getByRole("button", { name: "공통 일정 등록", exact: true }).click();
  await page.getByRole("heading", { name: "팀 회식", exact: true }).waitFor();
  await page.getByText("저장되었습니다.", { exact: true }).waitFor();
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `/tmp/common-event-detail-${width}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "일정 취소", exact: true }).click();
  await page.getByLabel("취소 사유", { exact: true }).fill("테스트 종료");
  await page.getByRole("button", { name: "일정 취소 확정", exact: true }).click();
  await page.locator(".common-detail").getByText(/취소됨/).waitFor();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  assert.ok(await page.locator('.common-cell-event').count() >= 1);
  await page.getByRole("button", { name: "팀 주간 회의 공통 일정 열기", exact: true }).click();
  await page.getByRole("heading", { name: "팀 주간 회의", exact: true }).waitFor();
  assert.ok(await page.locator('.common-date-tabs button.active').innerText().then(t => t.includes("공통 일정")));
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "/tmp/common-event-calendar.png", fullPage: true });
  console.log("PASS common-event UI: create/edit/cancel without response controls, weekly context, calendar badges and responsive layouts");
  assert.deepEqual(errors, []);
  for (let i = 0; i < 10; i++) {
    if (i >= 8) put("members", `m${i}`, { id: `m${i}`, name: `테스트${i}`, color: "#619384", active: true });
    put("absences", `dense-${i}`, { id: `dense-${i}`, memberId: `m${i}`, startDate: i === 9 ? "2026-10-14" : "2026-10-12", endDate: i === 9 || i === 2 ? "2026-10-14" : "2026-10-16", type: "annual", label: i === 9 ? "장기교육출장" : "", memo: "" });
  }
  put("absences", "dense-2-next", { id: "dense-2-next", memberId: "m2", startDate: "2026-10-15", endDate: "2026-10-16", type: "annual", label: "", memo: "" });
  put("absences", "outside-month", { id: "outside-month", memberId: "m2", startDate: "2026-09-30", endDate: "2026-09-30", type: "annual", label: "", memo: "" });
  const dense = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  dense.on("pageerror", e => errors.push(e.message));
  await dense.goto(origin);
  await dense.getByRole("button", { name: "가상 팀원 3", exact: true }).click();
  await showMonth(dense, 10);
  const denseBars = dense.locator('.continuous-week').filter({ has: dense.locator('.date-number').filter({ hasText: /^14$/ }) }).locator('.continuous-absence');
  await denseBars.first().waitFor();
  assert.equal(await denseBars.count(), 10);
  assert.ok(await dense.locator('.continuous-absence').evaluateAll(es => es.some(e => getComputedStyle(e).getPropertyValue("--month-from").trim() === "100%")));
  for (const width of [1440, 768, 390, 320]) {
    await dense.setViewportSize({ width, height: 1100 });
    await dense.screenshot({ path: `/tmp/continuous-calendar-${width}.png`, fullPage: true });
    assert.equal(await dense.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `dense overflow ${width}`);
    assert.equal(await dense.locator('.continuous-absence').evaluateAll(items => items.filter(e => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).length), 0);
    const bar = denseBars.first();
    assert.ok((await bar.boundingBox()).width > (await dense.locator('.calendar-cell').first().boundingBox()).width * 4);
    await dense.screenshot({ path: `/tmp/continuous-calendar-${width}.png`, fullPage: true });
  }
  await dense.setViewportSize({ width: 1440, height: 1100 });
  const barBox = await denseBars.first().boundingBox();
  await dense.mouse.click(barBox.x + barBox.width / 2, barBox.y + barBox.height / 2);
  await dense.locator('.day-detail-modal').waitFor();
  await dense.getByRole("button", { name: "연차 2026-10-12 ~ 2026-10-14 수정", exact: true }).click();
  assert.match(await dense.locator('.attendance-edit-scope').innerText(), /막대 표시 기간: 2026-10-12 ~ 2026-10-16/);
  assert.match(await dense.locator('.attendance-edit-scope').innerText(), /이번 수정 대상: 2026-10-12 ~ 2026-10-14/);
  await dense.getByRole("button", { name: "닫기", exact: true }).click();
  await dense.locator('.desktop-mode').getByRole("button", { name: "잔업", exact: true }).click();
  assert.equal(await dense.locator('.continuous-absence').count(), 0);
  await dense.locator('.desktop-mode').getByRole("button", { name: "통합", exact: true }).click();
  assert.equal(await denseBars.count(), 10);
  const startBox = await dense.locator('.calendar-cell[aria-label^="2026-10-12"]').boundingBox();
  const endBox = await dense.locator('.calendar-cell[aria-label^="2026-10-14"]').boundingBox();
  await dense.mouse.move(startBox.x + 10, startBox.y + 15);
  await dense.mouse.down();
  await dense.mouse.move(endBox.x + 10, endBox.y + 15, { steps: 10 });
  await dense.mouse.up();
  await dense.getByRole("button", { name: "이 기간에 부재 등록", exact: true }).waitFor();
  await dense.getByRole("button", { name: "닫기", exact: true }).click();
  await dense.getByRole("tab", { name: "Bay 배정", exact: true }).click();
  await dense.getByLabel("조회 날짜", { exact: true }).fill("2026-11-02");
  await dense.getByText("오늘 배정 없음", { exact: true }).first().waitFor();
  await dense.getByRole("button", { name: "지원 배정", exact: true }).first().click();
  assert.equal(await dense.getByLabel("백업 Bay", { exact: true }).inputValue(), "Wet");
  await dense.locator('dialog.bay-dialog[open]').getByRole("button", { name: "닫기", exact: true }).first().click();
  await dense.getByRole("tab", { name: "월 기본 배정", exact: true }).click();
  await dense.getByLabel("조회 월", { exact: true }).fill("2026-10");
  await dense.getByRole("button", { name: "지난달 배정 가져오기", exact: true }).click();
  await dense.getByRole("heading", { name: "지난달 배정 검토", exact: true }).waitFor();
  const carryRows = await dense.locator('.bay-carry-row label').allTextContents();
  assert.ok(carryRows.some(t => t.includes("가상 팀원 1")));
  assert.ok(!carryRows.some(t => t.includes("가상 팀원 2")));
  assert.equal((await post({ ...base, memberId: "m0", revision: 0, requestId: "carry-race", bay: "Wet" })).status, 200);
  await dense.getByRole("button", { name: "선택 배정 저장", exact: true }).click();
  await dense.getByText("완료된 항목은 유지됩니다. 충돌 항목은 닫고 최신 배정을 다시 검토해주세요.", { exact: true }).waitFor();
  await dense.getByRole("button", { name: "선택 배정 저장", exact: true }).waitFor();
  assert.ok(await dense.getByText("저장 완료", { exact: true }).count() > 0);
  const latestBay = await (await fetch(origin + "/api/bay")).json();
  assert.equal(latestBay.schedules.find(s => s.id === "m0").months["2026-10"], "Wet");
  const copied = latestBay.schedules.find(s => s.id === "m7");
  assert.ok(copied.history.some(h => h.action === "carry"));
  const carryCommand = { kind: "carry", memberId: "m7", actorId: "m2", revision: copied.revision - 1, requestId: copied.history.at(-1).id, month: "2026-10", reason: "repeat" };
  assert.equal((await post(carryCommand)).status, 200);
  assert.equal((await post({ ...carryCommand, revision: copied.revision, requestId: "overwrite-copy" })).status, 422);
  await dense.screenshot({ path: "/tmp/bay-carry-review.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log("PASS continuous attendance: 10 people, unbroken five-day bars, long types, 1440/768/390/320 layouts, click-through");
  console.log("PASS UI: user selection, view switching, monthly update/history, mobile backup registration, no overflow at 1440/1024/768/390, no JS errors");
  }
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) { await page.screenshot({ path: "/tmp/bay-test-failure.png", fullPage: true }); console.log((await page.locator("body").innerText()).slice(-2500)); }
  throw error;
} finally {
  await browser?.close();
  server.kill("SIGTERM"); await once(server, "exit");
  fixture.close();
}
