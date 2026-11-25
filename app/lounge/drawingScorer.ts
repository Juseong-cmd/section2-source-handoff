import { scoreDrawingDetailed, type PixelImage, type DrawingReferenceId, type ShapeScore } from "./drawingSimilarity";

let nextId = 0;
export async function scoreInWorker(worker: Worker | null, image: PixelImage, reference: Uint8Array | DrawingReferenceId, rendered?:PixelImage): Promise<ShapeScore> {
  if (!worker) return scoreDrawingDetailed(image, reference, rendered);
  const id = ++nextId;
  try {
    return await new Promise<ShapeScore>((resolve, reject) => {
      const clean = () => { clearTimeout(timer); worker.removeEventListener("message", message); worker.removeEventListener("error", error); };
      const message = (event: MessageEvent) => {
        if (event.data.id !== id) return;
        clean();
        if (event.data.result) resolve(event.data.result); else reject(new Error("Scoring failed"));
      };
      const error = () => { clean(); reject(new Error("Worker unavailable")); };
      const timer = setTimeout(error, 5000);
      worker.addEventListener("message", message);
      worker.addEventListener("error", error);
      try { worker.postMessage({id, image, reference, rendered}); } catch { error(); }
    });
  } catch { return scoreDrawingDetailed(image, reference, rendered); }
}
