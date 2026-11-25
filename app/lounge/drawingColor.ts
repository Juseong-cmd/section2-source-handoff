export type HsvColor = {h:number;s:number;v:number};
const clamp=(value:number,max:number)=>Math.min(max,Math.max(0,value));
export function hsvToHex({h,s,v}:HsvColor) {
  h=((h%360)+360)%360;s=clamp(s,100)/100;v=clamp(v,100)/100;
  const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;
  const rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
  return '#'+rgb.map(n=>Math.round((n+m)*255).toString(16).padStart(2,'0')).join('');
}
export function hexToHsv(hex:string,previousHue=0):HsvColor {
  if(!/^#[0-9a-f]{6}$/i.test(hex))throw new Error('Invalid hex color');
  const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
  const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
  const h=delta===0?previousHue:max===r?60*(((g-b)/delta+6)%6):max===g?60*((b-r)/delta+2):60*((r-g)/delta+4);
  return {h,s:max===0?0:delta/max*100,v:max*100};
}
