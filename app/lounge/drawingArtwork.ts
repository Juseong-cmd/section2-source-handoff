import type { PixelImage } from "./drawingSimilarity";

// Choose whitespace near grid boundaries so wider ears/tails are not clipped.
export function artworkRegion(image: PixelImage, tile: number) {
  const cellWidth = image.width / 5;
  const cellHeight = image.height / 2;
  const ink = (x: number, y: number) => {
    const i = (y * image.width + x) * 4;
    return image.data[i + 3] > 24 && Math.min(image.data[i], image.data[i + 1], image.data[i + 2]) < 220;
  };
  const bestCut = (expected: number, radius: number, count: (position: number) => number) => {
    let best = Math.round(expected);
    let score = Infinity;
    for (let p = Math.ceil(expected - radius); p <= Math.floor(expected + radius); p++) {
      const candidate = count(p) * 1000 + Math.abs(p - expected);
      if (candidate < score) { score = candidate; best = p; }
    }
    return best;
  };
  const middle = bestCut(cellHeight, cellHeight * 0.1, y => {
    let count = 0;
    for (let x = 0; x < image.width; x++) if (ink(x, y)) count++;
    return count;
  });
  const top = tile < 5 ? 0 : middle;
  const bottom = tile < 5 ? middle : image.height;
  const cut = (column: number) => column === 0 ? 0 : column === 5 ? image.width : bestCut(column * cellWidth, cellWidth * 0.16, x => {
    let count = 0;
    for (let y = top; y < bottom; y++) if (ink(x, y)) count++;
    return count;
  });
  const left = cut(tile % 5), right = cut(tile % 5 + 1);
  return { x: left, y: top, width: right - left, height: bottom - top };
}
