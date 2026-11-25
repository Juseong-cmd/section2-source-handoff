import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { initialData } from "../app/data.ts";

const origin = "http://127.0.0.1:3447";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3447"], {stdio:"ignore"});
let browser;
try {
  for (let i=0;i<80;i++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (server.exitCode!==null || i===79) throw new Error("App startup failed");
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  const playwright = process.env.PLAYWRIGHT_MODULE || join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs");
  const {chromium}=await import(playwright);
  browser=await chromium.launch({channel:"chrome",headless:true});
  const context=await browser.newContext();
  await context.addInitScript(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  });
  const members=["검증 사용자 A","검증 사용자 B"].map((name,i)=>({id:String(i),name,active:true,color:"#112233"}));
  let heartbeats=0;
  await context.route("**/api/**",route=>{
    const url=new URL(route.request().url());
    if(url.pathname==="/api/presence") {heartbeats++;return route.fulfill({json:{count:1}});}
    if(url.pathname==="/api/state") return route.fulfill({json:{data:{...initialData,members},updatedAt:null}});
    return route.fulfill({json:{events:[],responses:[],schedules:[]}});
  });
  const first=await context.newPage();
  await first.addInitScript(() => {
    sessionStorage.setItem("sms-section2-actor-v1","검증 사용자 A");
    sessionStorage.setItem("sms-section2-actor-selected-at-v1",String(Date.now()));
  });
  await first.goto(origin);
  await first.getByText("접속 1명",{exact:true}).waitFor();
  assert.equal(heartbeats,1);
  const second=await context.newPage();
  await second.addInitScript(() => {
    sessionStorage.setItem("sms-section2-actor-v1","검증 사용자 B");
    sessionStorage.setItem("sms-section2-actor-selected-at-v1",String(Date.now()));
  });
  await second.goto(origin);
  await second.getByText("접속 1명",{exact:true}).waitFor();
  assert.equal(heartbeats,1);
  console.log("PASS two visible tabs share one heartbeat and both display the server count");
} finally {
  if(browser) await browser.close();
  if(server.exitCode===null) { server.kill(); await once(server,"exit"); }
}
