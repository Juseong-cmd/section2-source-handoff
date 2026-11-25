import { scoreDrawingDetailed, type PixelImage, type DrawingReferenceId } from "./drawingSimilarity";

self.onmessage = (event: MessageEvent<{id: number; image: PixelImage; reference: Uint8Array | DrawingReferenceId; rendered?:PixelImage}>) => {
  const {id, image, reference, rendered} = event.data;
  try { self.postMessage({id, result: scoreDrawingDetailed(image, reference, rendered)}); }
  catch { self.postMessage({id, error: "채점하지 못했습니다."}); }
};
