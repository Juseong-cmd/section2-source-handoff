import assert from "node:assert/strict";
import test from "node:test";
import { createDrawingReference, createRabbitReference, normalizeBinaryImage, referenceFromArtwork, scoreDrawing, similarityScore } from "./drawingSimilarity.ts";

test("identical reference shape receives a perfect score", () => {
  const reference = createRabbitReference();
  assert.equal(similarityScore(reference, reference), 100);
});

test("normalization centers ink from a larger source image", () => {
  const width = 80;
  const height = 60;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 10; y <= 45; y += 1) {
    const x = 18 + Math.round((y - 10) * 0.7);
    data[(y * width + x) * 4 + 3] = 255;
  }
  const normalized = normalizeBinaryImage({ width, height, data });
  assert.ok(normalized.reduce((sum, value) => sum + value, 0) > 10);
});

test("an unrelated line scores below the rabbit reference", () => {
  const reference = createRabbitReference();
  const line = new Uint8Array(128 * 128);
  for (let x = 2; x < 126; x += 1) line[64 * 128 + x] = 1;
  assert.ok(similarityScore(line, reference) < 60);
});

test("a dot or tiny mark cannot receive a plausible drawing score", () => {
  const width = 640;
  const height = 360;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 176; y < 184; y += 1) {
    for (let x = 316; x < 324; x += 1) data[(y * width + x) * 4 + 3] = 255;
  }
  assert.equal(scoreDrawing({ width, height, data }, "cat"), 0);
});

test("a single long line is rejected as an incomplete drawing", () => {
  const width = 640;
  const height = 360;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let x = 80; x < 560; x += 1) data[(180 * width + x) * 4 + 3] = 255;
  assert.equal(scoreDrawing({ width, height, data }, "rabbit"), 0);
});

test("every daily animal has a non-empty deterministic reference", () => {
  const references = ["rabbit", "cat", "dog", "penguin", "otter", "hamster", "fox", "chick", "bear"] as const;
  references.forEach((referenceId) => {
    const first = createDrawingReference(referenceId);
    const second = createDrawingReference(referenceId);
    assert.deepEqual(first, second);
    assert.ok(first.reduce((sum, value) => sum + value, 0) > 20);
  });
});

test("artwork normalization ignores white background and preserves dark contour", () => {
  const data = new Uint8ClampedArray(80 * 80 * 4).fill(255);
  assert.equal(referenceFromArtwork({ width: 80, height: 80, data }).some(Boolean), false);
  for (let y = 15; y < 65; y++) for (let x = 15; x < 65; x++) {
    if (x === 15 || x === 64 || y === 15 || y === 64) {
      const i = (y * 80 + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 20;
    }
  }
  assert.ok(referenceFromArtwork({ width: 80, height: 80, data }).reduce((sum, v) => sum + v, 0) > 80);
});


test("missing features and a dense scribble cannot approach a perfect match", () => {
  const reference = createRabbitReference();
  const missing = reference.map((v, i) => i < 128 * 52 ? 0 : v);
  const dense = new Uint8Array(128 * 128);
  for (let y = 5; y < 123; y++) for (let x = 5; x < 123; x++) dense[y * 128 + x] = 1;
  assert.ok(similarityScore(missing, reference) < 85);
  assert.ok(similarityScore(dense, reference) < 60);
});

test("a white opaque background does not change drawing scores", () => {
  const width = 100, height = 100;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 15; y < 85; y++) for (let x = 15; x < 85; x++) {
    if (x < 19 || x > 80 || y < 19 || y > 80) data[(y * width + x) * 4 + 3] = 255;
  }
  const reference = referenceFromArtwork({width,height,data});
  const transparentScore = scoreDrawing({width,height,data}, reference);
  for (let i = 0; i < width * height; i++) if (!data[i*4+3]) data.fill(255, i*4, i*4+4);
  assert.equal(scoreDrawing({width,height,data}, reference), transparentScore);
  assert.equal(transparentScore, 100);
});

test("distance transform includes diagonal distance and validates dimensions", async () => {
  const {distanceTransform} = await import('./drawingSimilarity.ts');
  const mask = new Uint8Array(25); mask[12] = 1;
  const d = distanceTransform(mask, 5);
  assert.equal(d[12], 0);
  assert.equal(d[13], 1);
  assert.ok(Math.abs(d[6] - Math.SQRT2) < 0.001);
  assert.throws(() => distanceTransform(mask, 4));
});

test("stroke width is normalized while missing and extra contours lose points", () => {
  const width = 256, height = 256;
  const rectangle = (thickness: number) => {
    const data = new Uint8ClampedArray(width*height*4);
    for (let y=40; y<=216; y++) for(let x=40; x<=216; x++) {
      if(x<40+thickness || x>216-thickness || y<40+thickness || y>216-thickness) data[(y*width+x)*4+3]=255;
    }
    return {width,height,data};
  };
  const ref = referenceFromArtwork(rectangle(5));
  assert.ok(scoreDrawing(rectangle(11), ref) >= 90);
  const missing = ref.map((v,i)=> i%128 < 64 ? v : 0);
  assert.ok(similarityScore(missing,ref) < 80);
  const extra = ref.slice();
  for(let y=15;y<112;y++) extra[y*128+64]=1;
  assert.ok(similarityScore(extra,ref) < similarityScore(ref,ref));
});

test("transparent pen strokes score equally across dark, yellow, pastel and white colors", async()=>{
  const {drawingMask,packMask,unpackMask,scoreDrawingDetailed}=await import('./drawingSimilarity.ts');
  const make=(rgb:number[],size=100,offsetX=20,offsetY=20)=>{
    const width=640,height=360,data=new Uint8ClampedArray(width*height*4);
    const thickness=Math.max(2,Math.round(size*0.04));
    for(let y=offsetY;y<offsetY+size;y++)for(let x=offsetX;x<offsetX+size;x++)if(x<offsetX+thickness||x>=offsetX+size-thickness||y<offsetY+thickness||y>=offsetY+size-thickness)data.set([...rgb,255],(y*width+x)*4);
    return {width,height,data};
  };
  const reference=drawingMask(make([23,32,51]));
  for(const rgb of [[23,32,51],[230,161,26],[255,242,168],[249,231,207],[255,255,255]])assert.equal(scoreDrawing(make(rgb),reference),100);
  assert.ok(scoreDrawing(make([230,161,26],30,510,270),reference)>=90);
  const scored=scoreDrawingDetailed(make([230,161,26]),reference);
  assert.equal(scored.version,'contour-v4');assert.ok(scored.comparison);
  assert.deepEqual(unpackMask(packMask(reference),128),reference);
  assert.throws(()=>unpackMask('bad',128));assert.throws(()=>unpackMask(packMask(reference),256));
});

test("a round pen tap is not enlarged into a plausible contour",()=>{
 const width=640,height=360,data=new Uint8ClampedArray(width*height*4);
 for(let y=170;y<190;y++)for(let x=310;x<330;x++)if(Math.hypot(x-320,y-180)<=7)data[(y*width+x)*4+3]=255;
 assert.equal(scoreDrawing({width,height,data},'cat'),0);
});


test("dense or missing stroke masks recover visible colored artwork; blank/tap stays zero",async()=>{
 const {scoreDrawingDetailed,referenceFromArtwork}=await import('./drawingSimilarity.ts');
 const width=256,height=256,blank=new Uint8ClampedArray(width*height*4),rendered=blank.slice(),dense=blank.slice();
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const r=Math.hypot(x-128,y-128);if(r>75)continue;
  const dark=r>71||Math.hypot(x-103,y-115)<5||Math.hypot(x-153,y-115)<5||(y>140&&y<145&&x>115&&x<142);
  rendered.set(dark?[23,32,51,255]:[255,225,110,255],(y*width+x)*4);dense.set([23,32,51,255],(y*width+x)*4);
 }
 const reference=referenceFromArtwork({width,height,data:rendered});
 for(const data of [blank,dense]){const result=scoreDrawingDetailed({width,height,data},reference,{width,height,data:rendered});assert.equal(result.score,100);assert.equal(result.maskSource,'rendered-contour');assert.equal(result.rawScore,100);}
 assert.equal(scoreDrawingDetailed({width,height,data:blank},reference,{width,height,data:blank}).score,0);
 const tap=blank.slice();for(let y=120;y<136;y++)for(let x=120;x<136;x++)if(Math.hypot(x-128,y-128)<7)tap.set([23,32,51,255],(y*width+x)*4);
 assert.equal(scoreDrawingDetailed({width,height,data:tap},reference,{width,height,data:tap}).score,0);
});
test("game scores encourage completed work without inverting relative shape scores",async()=>{
 const {gameDrawingScore}=await import('./drawingSimilarity.ts');assert.equal(gameDrawingScore(0),0);assert.equal(gameDrawingScore(50),80);assert.equal(gameDrawingScore(60),85);assert.equal(gameDrawingScore(64),87);assert.equal(gameDrawingScore(100),100);
 for(let i=1;i<100;i++){assert.ok(gameDrawingScore(i)>=gameDrawingScore(i-1));assert.ok(gameDrawingScore(i)<100);}
});

test("single diagonal lines do not receive inflated game points",async()=>{
 const {scoreDrawingDetailed}=await import('./drawingSimilarity.ts');
 const width=256,height=256,data=new Uint8ClampedArray(width*height*4);
 for(let y=30;y<220;y++)for(let x=30;x<220;x++)if(Math.abs(x-y)<3)data.set([23,32,51,255],(y*width+x)*4);
 assert.equal(scoreDrawingDetailed({width,height,data},'cat',{width,height,data}).score,0);
});
