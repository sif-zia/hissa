/**
 * The captured frame never becomes a file. Shutter draws the current video
 * frame to a canvas, scales the long side to 1400px and encodes JPEG 0.75 in
 * one step. That single image is the only thing that leaves the device, and
 * cost of extraction is linear in pixels. Spec §2.2, §7.
 */

export interface Shot {
  /** data: URL for the preview */
  preview: string;
  /** the same image, base64 payload only, for the extraction call */
  base64: string;
}

const MAX = 1400;
const QUALITY = 0.75;

function encode(source: CanvasImageSource, w: number, h: number): Shot {
  const scale = Math.min(1, MAX / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("no canvas context");
  ctx.drawImage(source, 0, 0, c.width, c.height);
  const data = c.toDataURL("image/jpeg", QUALITY);
  return { preview: data, base64: data.slice(data.indexOf(",") + 1) };
}

/** Grabs the live frame from the viewfinder. */
export function grab(video: HTMLVideoElement): Shot {
  const { videoWidth: w, videoHeight: h } = video;
  if (!w || !h) throw new Error("no frame");
  return encode(video, w, h);
}

/** Fallback path: a photo the user already had, or the native camera app. */
export function shrink(file: File): Promise<Shot> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        resolve(encode(img, img.width, img.height));
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("bad image"));
    };
    img.src = url;
  });
}
