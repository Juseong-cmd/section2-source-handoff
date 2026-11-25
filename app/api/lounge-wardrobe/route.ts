import { isAllowedRequestOrigin } from "../../lib/request-origin";
import {NextResponse} from 'next/server';
import {readCurrentState,isStoreFailure} from '../../lib/record-state';
import {updateWardrobe,type WardrobeCommand} from '../../lib/lounge-store';
export const dynamic='force-dynamic';
export const maxDuration=60;
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function run(memberId:string,command:WardrobeCommand) {
 try {
  const state=await readCurrentState({collections:["members", "characterProfiles", "dailyCharacterExp", "drawingSubmissions"]});if(!state||isStoreFailure(state))return json({error:'저장 서버에 연결하지 못했습니다.'},503);
  return json({profile:await updateWardrobe(state.data,memberId,command)});
 }catch(e){return json({error:e instanceof Error?e.message:'꾸미기를 저장하지 못했습니다.'},409);}
}
export async function GET(request:Request) {
 const id=new URL(request.url).searchParams.get('memberId')??'';
 if(!id||id.length>200)return json({error:'사용자를 확인해주세요.'},400);
 return run(id,{kind:'read'});
}
export async function POST(request:Request) {
 if (!isAllowedRequestOrigin(request))return json({error:'Invalid origin'},403);
 try {
  const text=await request.text();if(text.length>5000)return json({error:'Invalid request'},400);
  const body=JSON.parse(text);
  if(typeof body.memberId!=='string'||body.memberId.length>200||!['claim','equip'].includes(body.kind))return json({error:'Invalid request'},400);
  if(body.kind==='claim'&&typeof body.itemId!=='string')return json({error:'Invalid item'},400);
  return run(body.memberId,body);
 }catch{return json({error:'요청 내용을 확인해주세요.'},400);}
}
