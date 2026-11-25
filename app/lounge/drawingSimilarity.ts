export const NORMALIZED_SIZE = 128;
const INK_ALPHA_THRESHOLD = 24;

export type PixelImage = {
  width: number;
  height: number;
  data: ArrayLike<number>;
};

type Point = { x: number; y: number };

export type DrawingReferenceId = "rabbit" | "cat" | "dog" | "penguin" | "otter" | "hamster" | "fox" | "chick" | "bear";

function isInk(image: PixelImage, x: number, y: number) {
  const i = (y * image.width + x) * 4;
  return Number(image.data[i + 3]) >= INK_ALPHA_THRESHOLD && Math.min(Number(image.data[i]), Number(image.data[i+1]), Number(image.data[i+2])) < 245;
}

export function normalizeBinaryImage(image: PixelImage, size = NORMALIZED_SIZE) {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (!isInk(image, x, y)) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  const result = new Uint8Array(size * size);
  if (maxX < minX || maxY < minY) return result;

  const sourceWidth = maxX - minX + 1;
  const sourceHeight = maxY - minY + 1;
  const drawable = size - 4;
  const scale = Math.min(drawable / sourceWidth, drawable / sourceHeight);
  const offsetX = (size - sourceWidth * scale) / 2;
  const offsetY = (size - sourceHeight * scale) / 2;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!isInk(image, x, y)) continue;
      const targetX = Math.min(size - 1, Math.max(0, Math.round(offsetX + (x - minX) * scale)));
      const targetY = Math.min(size - 1, Math.max(0, Math.round(offsetY + (y - minY) * scale)));
      if (scale <= 1) result[targetY * size + targetX] = 1;
      else {
        for (let ty = Math.max(0, Math.floor(offsetY + (y-minY)*scale)); ty < Math.min(size, Math.ceil(offsetY + (y-minY+1)*scale)); ty++)
          for (let tx = Math.max(0, Math.floor(offsetX + (x-minX)*scale)); tx < Math.min(size, Math.ceil(offsetX + (x-minX+1)*scale)); tx++) result[ty*size+tx] = 1;
      }
    }
  }

  return result;
}

function createShape(size: number) {
  const result = new Uint8Array(size * size);
  const set = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < size && y < size) result[y * size + x] = 1;
  };
  const line = (from: Point, to: Point) => {
    const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
    for (let index = 0; index <= steps; index += 1) {
      set(Math.round(from.x + ((to.x - from.x) * index) / steps), Math.round(from.y + ((to.y - from.y) * index) / steps));
    }
  };
  const ellipse = (centerX: number, centerY: number, radiusX: number, radiusY: number) => {
    for (let degree = 0; degree < 360; degree += 2) {
      const angle = (degree * Math.PI) / 180;
      set(Math.round(centerX + Math.cos(angle) * radiusX), Math.round(centerY + Math.sin(angle) * radiusY));
    }
  };
  return { result, set, line, ellipse };
}

export function createRabbitReference(size = NORMALIZED_SIZE) {
  const { result, line, ellipse } = createShape(size);
  const centerX = size / 2;
  const centerY = size * 0.6;
  const radiusX = size * 0.34;
  const radiusY = size * 0.28;
  ellipse(centerX, centerY, radiusX, radiusY);
  line({ x: Math.round(size * 0.29), y: Math.round(size * 0.4) }, { x: Math.round(size * 0.23), y: 2 });
  line({ x: Math.round(size * 0.39), y: Math.round(size * 0.34) }, { x: Math.round(size * 0.36), y: 2 });
  line({ x: Math.round(size * 0.61), y: Math.round(size * 0.34) }, { x: Math.round(size * 0.64), y: 2 });
  line({ x: Math.round(size * 0.71), y: Math.round(size * 0.4) }, { x: Math.round(size * 0.77), y: 2 });
  return result;
}

export function createDrawingReference(referenceId: DrawingReferenceId, size = NORMALIZED_SIZE) {
  if (referenceId === "rabbit") return createRabbitReference(size);
  const { result, line, ellipse } = createShape(size);
  const x = (ratio: number) => Math.round(size * ratio);
  const head = () => ellipse(x(0.5), x(0.55), size * 0.34, size * 0.29);

  if (referenceId === "cat" || referenceId === "fox") {
    head();
    line({ x: x(0.2), y: x(0.42) }, { x: x(0.25), y: x(0.08) });
    line({ x: x(0.25), y: x(0.08) }, { x: x(0.43), y: x(0.3) });
    line({ x: x(0.57), y: x(0.3) }, { x: x(0.75), y: x(0.08) });
    line({ x: x(0.75), y: x(0.08) }, { x: x(0.8), y: x(0.42) });
    if (referenceId === "fox") {
      line({ x: x(0.18), y: x(0.58) }, { x: x(0.33), y: x(0.73) });
      line({ x: x(0.67), y: x(0.73) }, { x: x(0.82), y: x(0.58) });
    }
    return result;
  }

  if (referenceId === "dog") {
    head();
    ellipse(x(0.18), x(0.5), size * 0.13, size * 0.25);
    ellipse(x(0.82), x(0.5), size * 0.13, size * 0.25);
    return result;
  }

  if (referenceId === "penguin") {
    ellipse(x(0.5), x(0.52), size * 0.3, size * 0.43);
    line({ x: x(0.2), y: x(0.45) }, { x: x(0.08), y: x(0.72) });
    line({ x: x(0.8), y: x(0.45) }, { x: x(0.92), y: x(0.72) });
    return result;
  }

  if (referenceId === "chick") {
    ellipse(x(0.5), x(0.56), size * 0.34, size * 0.34);
    line({ x: x(0.43), y: x(0.23) }, { x: x(0.5), y: x(0.08) });
    line({ x: x(0.5), y: x(0.08) }, { x: x(0.57), y: x(0.23) });
    return result;
  }

  head();
  ellipse(x(0.27), x(0.29), size * 0.12, size * 0.12);
  ellipse(x(0.73), x(0.29), size * 0.12, size * 0.12);
  if (referenceId === "otter") {
    line({ x: x(0.75), y: x(0.74) }, { x: x(0.93), y: x(0.9) });
  }
  return result;
}

export type ShapeMetrics = { coverage: number; precision: number; shape: number; extra: number };
export type ShapeScore = { score: number; metrics: ShapeMetrics; version: "contour-v3" | "contour-v4"; rawScore?: number; maskSource?: "strokes" | "rendered-contour" | "rendered-outline"; comparison?: {size: number; reference: string; drawing: string} };

// Zhang–Suen thinning keeps connected contour centerlines independent of pen width.
export function thinMask(mask: Uint8Array, size: number) {
  const out = mask.slice();
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      const remove: number[] = [];
      for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
        const i = y * size + x;
        if (!out[i]) continue;
        const p = [out[i-size], out[i-size+1], out[i+1], out[i+size+1], out[i+size], out[i+size-1], out[i-1], out[i-size-1]];
        const neighbors = p.reduce((sum, v) => sum + v, 0);
        const transitions = p.reduce((sum, v, j) => sum + (!v && p[(j+1)%8] ? 1 : 0), 0);
        if (neighbors < 2 || neighbors > 6 || transitions !== 1) continue;
        if (pass === 0 ? p[0]*p[2]*p[4] || p[2]*p[4]*p[6] : p[0]*p[2]*p[6] || p[0]*p[4]*p[6]) continue;
        remove.push(i);
      }
      if (remove.length) changed = true;
      for (const i of remove) out[i] = 0;
    }
  }
  return out;
}

// Two-pass 8-neighbor distance transform; O(size²), with diagonal cost sqrt(2).
export function distanceTransform(mask: Uint8Array, size: number) {
  if (mask.length !== size * size) throw new Error("Invalid mask dimensions");
  const d = Float32Array.from(mask, v => v ? 0 : size * 2);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    if (x) d[i] = Math.min(d[i], d[i-1]+1);
    if (y) {
      d[i] = Math.min(d[i], d[i-size]+1);
      if (x) d[i] = Math.min(d[i], d[i-size-1]+Math.SQRT2);
      if (x+1 < size) d[i] = Math.min(d[i], d[i-size+1]+Math.SQRT2);
    }
  }
  for (let y = size-1; y >= 0; y--) for (let x = size-1; x >= 0; x--) {
    const i = y * size + x;
    if (x+1 < size) d[i] = Math.min(d[i], d[i+1]+1);
    if (y+1 < size) {
      d[i] = Math.min(d[i], d[i+size]+1);
      if (x) d[i] = Math.min(d[i], d[i+size-1]+Math.SQRT2);
      if (x+1 < size) d[i] = Math.min(d[i], d[i+size+1]+Math.SQRT2);
    }
  }
  return d;
}

const emptyScore = (): ShapeScore => ({score: 0, metrics: {coverage: 0, precision: 0, shape: 0, extra: 0}, version: "contour-v3"});

function hasSpatialStructure(mask:Uint8Array,size:number) {
  let n=0,sx=0,sy=0,sxx=0,syy=0,sxy=0;
  mask.forEach((v,i)=>{if(!v)return;const x=i%size,y=Math.floor(i/size);n++;sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y;});
  if(n<12)return false;
  const a=sxx/n-(sx/n)**2,b=syy/n-(sy/n)**2,c=sxy/n-sx*sy/n/n;
  const trace=a+b,delta=Math.sqrt((a-b)**2+4*c*c);
  return trace>0&&(trace-delta)/(trace+delta)>0.008;
}

export function contourScore(user: Uint8Array, reference: Uint8Array, size = NORMALIZED_SIZE): ShapeScore {
  if (user.length !== size*size || reference.length !== size*size) throw new Error("Invalid mask dimensions");
  const users = user.reduce((s,v) => s + (v ? 1 : 0), 0);
  const refs = reference.reduce((s,v) => s + (v ? 1 : 0), 0);
  if (users < 12 || !refs || !hasSpatialStructure(user,size)) return emptyScore();
  const du = distanceTransform(user, size), dr = distanceTransform(reference, size);
  const tolerance = size * 0.02;
  let covered = 0, precise = 0, extra = 0, refDistance = 0, userDistance = 0;
  const zoneCounts = new Float64Array(16), zoneMatches = new Float64Array(16);
  const proximity = (d: number) => Math.exp(-0.5 * (d / tolerance) ** 2);
  for (let i = 0; i < user.length; i++) {
    if (reference[i]) {
      const match = proximity(du[i]);
      covered += match;
      refDistance += du[i];
      const zone = Math.min(3, Math.floor((i % size) / size * 4)) + Math.min(3, Math.floor(Math.floor(i / size) / size * 4)) * 4;
      zoneCounts[zone]++; zoneMatches[zone] += match;
    }
    if (user[i]) {
      precise += proximity(dr[i]); userDistance += dr[i];
      if (dr[i] > tolerance*2) extra++;
    }
  }
  // Give local features a voice even when most ink belongs to the outer contour.
  let local = 0, regions = 0;
  zoneCounts.forEach((count, i) => { if (count >= 3) {local += zoneMatches[i]/count; regions++;} });
  const coverage = 0.7 * covered / refs + 0.3 * (regions ? local / regions : 0);
  const precision = precise / users;
  const shape = Math.exp(-(refDistance / refs + userDistance / users) / (2 * tolerance * 2.4));
  const clean = 1 - extra/users;
  let score = Math.round(100 * (0.45*coverage + 0.35*precision + 0.15*shape + 0.05*clean));
  if (coverage < 0.3) score = Math.min(score, 39);
  else if (coverage < 0.55) score = Math.min(score, 69);
  return {score, metrics: {coverage: Math.round(coverage*100), precision: Math.round(precision*100), shape: Math.round(shape*100), extra: Math.round(clean*100)}, version: "contour-v3"};
}

export function similarityScore(user: Uint8Array, reference: Uint8Array, size = NORMALIZED_SIZE) {
  return contourScore(user, reference, size).score;
}

export function referenceFromArtwork(image: PixelImage) {
  const mask = new Uint8Array(image.width * image.height);
  for (let i = 0; i < mask.length; i++) {
    const p = i * 4;
    const brightness = Number(image.data[p]) * 0.299 + Number(image.data[p + 1]) * 0.587 + Number(image.data[p + 2]) * 0.114;
    mask[i] = Number(image.data[p + 3]) >= INK_ALPHA_THRESHOLD && brightness < 145 ? 1 : 0;
  }
  const data = new Uint8ClampedArray(mask.length * 4);
  mask.forEach((value, i) => { if (value) data[i*4+3] = 255; });
  const skeleton = thinMask(normalizeBinaryImage({width: image.width, height: image.height, data}), NORMALIZED_SIZE);
  if(skeleton.reduce((sum,v)=>sum+v,0)<12)return new Uint8Array(NORMALIZED_SIZE*NORMALIZED_SIZE);
  // Normalize centerline bounds again so a wider pen does not shrink the shape.
  const centered = new Uint8ClampedArray(skeleton.length * 4);
  skeleton.forEach((v, i) => { if (v) centered[i*4+3] = 255; });
  return normalizeBinaryImage({width: NORMALIZED_SIZE, height: NORMALIZED_SIZE, data: centered});
}

// Submission pixels are transparent brush strokes, so opacity rather than hue
// identifies ink. The UI supplies normalized strokes from both drawing tools.
export function drawingMask(image: PixelImage) {
  const data = new Uint8ClampedArray(image.width * image.height * 4);
  let count = 0;
  let minX = image.width, maxX = -1, minY = image.height, maxY = -1;
  let opaque=true;
  for(let i=3;i<image.data.length;i+=4)if(Number(image.data[i])<INK_ALPHA_THRESHOLD){opaque=false;break;}
  for (let y=0; y<image.height; y++) for(let x=0; x<image.width; x++) {
    const pixel=(y*image.width+x)*4;
    if(Number(image.data[pixel+3])<INK_ALPHA_THRESHOLD || (opaque&&Math.min(Number(image.data[pixel]),Number(image.data[pixel+1]),Number(image.data[pixel+2]))>=250))continue;
    const i = y*image.width+x; data[i*4+3] = 255; count++;
    minX=Math.min(minX,x); maxX=Math.max(maxX,x); minY=Math.min(minY,y); maxY=Math.max(maxY,y);
  }
  if (count < 24 || maxX-minX < 2 || maxY-minY < 2 || count/((maxX-minX+1)*(maxY-minY+1))>0.60) return new Uint8Array(NORMALIZED_SIZE*NORMALIZED_SIZE);
  const skeleton=thinMask(normalizeBinaryImage({width:image.width,height:image.height,data}), NORMALIZED_SIZE);
  if(skeleton.reduce((sum,v)=>sum+v,0)<12)return new Uint8Array(NORMALIZED_SIZE*NORMALIZED_SIZE);
  const centered=new Uint8ClampedArray(skeleton.length*4);
  skeleton.forEach((v,i)=>{if(v) centered[i*4+3]=255;});
  return normalizeBinaryImage({width:NORMALIZED_SIZE,height:NORMALIZED_SIZE,data:centered});
}

export function packMask(mask: Uint8Array) {
  let result="";
  for(let i=0;i<mask.length;i+=4) result += ((mask[i]?8:0)|(mask[i+1]?4:0)|(mask[i+2]?2:0)|(mask[i+3]?1:0)).toString(16);
  return result;
}
export function unpackMask(hex: string, size: number) {
  if (size !== NORMALIZED_SIZE || hex.length !== size*size/4 || !/^[0-9a-f]+$/.test(hex)) throw new Error("Invalid comparison mask");
  const mask=new Uint8Array(size*size);
  for(let i=0;i<hex.length;i++) {const n=parseInt(hex[i],16); for(let j=0;j<4;j++) mask[i*4+j]=(n>>(3-j))&1;}
  return mask;
}
export function gameDrawingScore(rawScore:number) {
  if(!Number.isFinite(rawScore)||rawScore<=0)return 0;
  if(rawScore>=100)return 100;
  return Math.min(99,Math.round(100*Math.pow(rawScore/100,0.32)));
}

function visibleBoundary(image:PixelImage) {
  const mask=new Uint8Array(image.width*image.height),data=new Uint8ClampedArray(mask.length*4);
  let minX=image.width,minY=image.height,maxX=-1,maxY=-1;
  for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
    if(!isInk(image,x,y))continue;
    mask[y*image.width+x]=1;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
  }
  if(maxX-minX<40||maxY-minY<40)return new Uint8Array(NORMALIZED_SIZE*NORMALIZED_SIZE);
  for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
    const i=y*image.width+x;
    if(mask[i]&&(x===0||y===0||x===image.width-1||y===image.height-1||!mask[i-1]||!mask[i+1]||!mask[i-image.width]||!mask[i+image.width]))data[i*4+3]=255;
  }
  return thinMask(normalizeBinaryImage({width:image.width,height:image.height,data}),NORMALIZED_SIZE);
}

function hasVisibleExtent(image:PixelImage) {
  let minX=image.width,minY=image.height,maxX=-1,maxY=-1;
  for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(isInk(image,x,y)){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  return maxX-minX>=40&&maxY-minY>=40;
}
export function scoreDrawingDetailed(image: PixelImage, referenceId: DrawingReferenceId | Uint8Array = "rabbit", rendered?:PixelImage): ShapeScore {
  const reference=typeof referenceId === "string" ? createDrawingReference(referenceId) : referenceId;
  if(reference.length !== NORMALIZED_SIZE*NORMALIZED_SIZE || !reference.some(Boolean))return {...emptyScore(),version:"contour-v4",rawScore:0};
  let user=drawingMask(image);
  let maskSource:NonNullable<ShapeScore["maskSource"]>="strokes";
  if(!user.some(Boolean)&&rendered&&hasVisibleExtent(rendered)){
    user=referenceFromArtwork(rendered);maskSource="rendered-contour";
    if(!user.some(Boolean)){user=visibleBoundary(rendered);maskSource="rendered-outline";}
  }
  const result=contourScore(user,reference);
  return {...result,score:gameDrawingScore(result.score),rawScore:result.score,version:"contour-v4",maskSource,comparison:{size:NORMALIZED_SIZE,reference:packMask(reference),drawing:packMask(user)}};
}

export function scoreDrawing(image: PixelImage, referenceId: DrawingReferenceId | Uint8Array = "rabbit") {
  return scoreDrawingDetailed(image, referenceId).score;
}
