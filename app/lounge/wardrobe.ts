import type { CharacterId } from './types';
export const wardrobeSlots = ['head','face','neck','hand','outfit','background'] as const;
export type WardrobeSlot = typeof wardrobeSlots[number];
export type Equipment = Partial<Record<WardrobeSlot,string>>;
export type WardrobeState = {version:1;rewardedThrough:number;choicesSpent:number;owned:string[];equipped:Partial<Record<CharacterId,Equipment>>};
export type WardrobeItem = {id:string;name:string;slot:WardrobeSlot;level:number;asset?:string;filter?:string;scene?:string;stage?:'cleanroom'|'manufacturing'};
export const slotNames:Record<WardrobeSlot,string>={head:'머리',face:'얼굴',neck:'목',hand:'손 소품',outfit:'의상',background:'배경'};
const asset=(name:string)=>`/lounge/accessories/${name}.png`;
export const wardrobeItems:WardrobeItem[]=[
 {id:'ribbon',name:'딸기 리본',slot:'head',level:5,asset:asset('ribbon')},
 {id:'beret',name:'민트 베레모',slot:'head',level:5,asset:asset('beret')},
 {id:'ribbon-blue',name:'하늘 리본',slot:'head',level:5,asset:asset('ribbon'),filter:'hue-rotate(180deg)'},
 {id:'glasses',name:'동그란 안경',slot:'face',level:10,asset:asset('glasses')},
 {id:'glasses-pink',name:'로즈 안경',slot:'face',level:10,asset:asset('glasses'),filter:'sepia(.3) hue-rotate(290deg)'},
 {id:'flower',name:'데이지 한 송이',slot:'hand',level:15,asset:asset('flower')},
 {id:'wand',name:'별빛 지팡이',slot:'hand',level:15,asset:asset('wand')},
 {id:'cloud',name:'구름 산책',slot:'background',level:5,scene:'cloud'},
 {id:'garden',name:'작은 정원',slot:'background',level:15,scene:'garden'},
 {id:'peach',name:'복숭아 오후',slot:'background',level:10,scene:'peach'},
 {id:'night',name:'별이 뜬 밤',slot:'background',level:20,scene:'night'},
 {id:'scarf',name:'라벤더 스카프',slot:'neck',level:25,asset:asset('scarf')},
 {id:'scarf-mint',name:'새싹 스카프',slot:'neck',level:25,asset:asset('scarf'),filter:'hue-rotate(225deg)'},
 {id:'cleanroom',name:'방진복 코스튬',slot:'outfit',level:20,stage:'cleanroom'},
 {id:'wafer',name:'웨이퍼 코스튬',slot:'outfit',level:40,stage:'manufacturing'},
];
export const wardrobeCharacters:CharacterId[]=['rabbit','cat_orange','cat_russian_blue','dog','penguin','otter','hamster','fox','chick','bear'];
export const itemById=(id:string)=>wardrobeItems.find(i=>i.id===id);
export function syncWardrobe(value:WardrobeState|undefined,level:number,characterId:CharacterId):WardrobeState {
 const through=Math.floor(level/5)*5;
 const owned=new Set(value?.owned??[]);
 if(level>=20)owned.add('cleanroom');if(level>=40)owned.add('wafer');
 const equipped=value?.equipped??(level>=20?{[characterId]:{outfit:level>=40?'wafer':'cleanroom'}}:{});
 return {version:1,rewardedThrough:Math.max(through,value?.rewardedThrough??0),choicesSpent:value?.choicesSpent??0,owned:Array.from(owned),equipped};
}
export const availableChoices=(state:WardrobeState)=>Math.max(0,state.rewardedThrough/5-state.choicesSpent);
export function chooseWardrobeItem(state:WardrobeState,id:string,level:number):WardrobeState {
 const item=itemById(id);
 if(!item||item.stage||item.level>level)throw new Error('아직 선택할 수 없는 아이템입니다.');
 if(state.owned.includes(id))return state;
 if(!availableChoices(state))throw new Error('사용할 선택권이 없습니다.');
 return {...state,owned:[...state.owned,id],choicesSpent:state.choicesSpent+1};
}
export function validateEquipment(state:WardrobeState,input:unknown):Equipment {
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('장착 정보를 확인해주세요.');
 const result:Equipment={};
 for(const [slot,id] of Object.entries(input)) {
  const item=typeof id==='string'?itemById(id):undefined;
  if(!wardrobeSlots.includes(slot as WardrobeSlot)||!item||item.slot!==slot||!state.owned.includes(item.id))throw new Error('보유한 아이템만 장착할 수 있습니다.');
  result[slot as WardrobeSlot]=item.id;
 }
 if(result.outfit&&(result.head||result.face||result.neck||result.hand))throw new Error('기존 코스튬은 장신구와 함께 착용할 수 없습니다. 코스튬을 해제해주세요.');
 return result;
}
// Anatomical points are measured on the square contain canvas, not the raw image box.
export type Point={x:number;y:number};
export type CharacterAnatomy={eyes:[Point,Point];crown:Point;grip:Point;neck:Point;bowWidth:number;hatWidth:number;hatDrop?:number;handAngle:number};
export const characterAnatomy:Record<CharacterId,CharacterAnatomy>={
 rabbit:{eyes:[{x:39.99,y:48.72},{x:58.56,y:49.10}],crown:{x:53,y:28},grip:{x:29,y:61},neck:{x:49,y:65},bowWidth:38,hatWidth:51,handAngle:-18},
 cat_orange:{eyes:[{x:40.1,y:35.5},{x:58.6,y:37.0}],crown:{x:50,y:20},grip:{x:28.5,y:50.5},neck:{x:49,y:54.5},bowWidth:36,hatWidth:51,handAngle:-18},
 cat_russian_blue:{eyes:[{x:37.67,y:40.53},{x:61.87,y:40.51}],crown:{x:50,y:16},grip:{x:25.5,y:57},neck:{x:49,y:59},bowWidth:37,hatWidth:56,handAngle:-18},
 dog:{eyes:[{x:41.05,y:38.60},{x:58.72,y:38.50}],crown:{x:50,y:17.5},grip:{x:29,y:54.5},neck:{x:49,y:56.5},bowWidth:35,hatWidth:53,handAngle:-18},
 penguin:{eyes:[{x:39.42,y:37.17},{x:60.18,y:35.33}],crown:{x:49,y:16},grip:{x:22.5,y:48},neck:{x:49,y:52},bowWidth:46,hatWidth:59,handAngle:-20},
 otter:{eyes:[{x:38.29,y:34.87},{x:56.92,y:33.12}],crown:{x:48,y:16.5},grip:{x:69.5,y:49},neck:{x:48,y:53},bowWidth:35,hatWidth:52,handAngle:18},
 hamster:{eyes:[{x:40.90,y:42.76},{x:58.01,y:42.71}],crown:{x:49.5,y:24},grip:{x:28.5,y:56},neck:{x:49,y:59},bowWidth:34,hatWidth:50,handAngle:-18},
 fox:{eyes:[{x:38.49,y:42.34},{x:59.83,y:42.55}],crown:{x:49.5,y:20},grip:{x:27,y:58},neck:{x:49,y:60},bowWidth:36,hatWidth:54,handAngle:-18},
 chick:{eyes:[{x:38.52,y:41.31},{x:60.57,y:40.76}],crown:{x:49.5,y:17},grip:{x:24.5,y:59},neck:{x:49,y:59},bowWidth:38,hatWidth:56,handAngle:-20},
 bear:{eyes:[{x:38.50,y:35.50},{x:60.89,y:35.04}],crown:{x:50,y:11.5},grip:{x:78,y:49.5},neck:{x:49.5,y:57.5},bowWidth:37,hatWidth:57,hatDrop:6,handAngle:18},
};
export type AccessoryFit={x:number;y:number;w:number;h:number;rotate:number;pivotX:number;pivotY:number};
export function accessoryFit(character:CharacterId,item:WardrobeItem):AccessoryFit|null {
 const a=characterAnatomy[character];
 if(item.slot==='face') {
  const [left,right]=a.eyes,dx=right.x-left.x,dy=right.y-left.y;
  // Lens holes measured from the selected glasses PNG: (29.43%,50.21%) and (69.91%,50.21%).
  const width=Math.hypot(dx,dy)/.4048;
  return {x:(left.x+right.x)/2,y:(left.y+right.y)/2,w:width,h:width*793/1983,rotate:Math.atan2(dy,dx)*180/Math.PI,pivotX:49.67,pivotY:50.21};
 }
 if(item.slot==='head') {
  const hat=item.id==='beret',width=hat?a.hatWidth:a.bowWidth;
  return {x:a.crown.x,y:a.crown.y+(hat?(a.hatDrop??4):0),w:width,h:width*1024/1536,rotate:hat?-7:0,pivotX:50,pivotY:hat?70:49};
 }
 if(item.slot==='hand') {
  const flower=item.id==='flower',width=flower?20:19;
  return {x:a.grip.x,y:a.grip.y,w:width,h:width*(flower?1312/1199:1536/1024),rotate:a.handAngle,pivotX:50,pivotY:flower?78:72};
 }
 if(item.slot==='neck')return {x:a.neck.x,y:a.neck.y,w:37,h:37*1024/1536,rotate:0,pivotX:47.2,pivotY:48.4};
 return null;
}
