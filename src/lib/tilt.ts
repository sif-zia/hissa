import { hash } from "./identity";

/**
 * Deterministic rotation from a stable key.
 *
 * Deliberately not random: a tilt that changes between renders is nauseating
 * to look at and costs a repaint every time. Same key, same angle, forever.
 * Always applied as a transform, never as a layout offset.
 *
 * Range is explicit per call, because how far a thing may lean depends on how
 * big it is. A scattered chip at 9 degrees reads as pinned on by hand; a
 * full-width card at 9 degrees just reads as a broken layout.
 */
export type Lean = "page" | "card" | "note" | "scrap";

const RANGES: Record<Lean, [number, number]> = {
  page: [-1.2, 1.2],   // headings and anything the eye reads along
  card: [-1.4, 1.8],   // full-width blocks: barely there, on purpose
  note: [-2.6, 3.4],   // inset sticky notes
  scrap: [-4, 11],     // small scattered things: chips, codes, stickers
};

export function tilt(key: string, lean: Lean = "card"): number {
  const [lo, hi] = RANGES[lean];
  const deg = lo + (hash(key) % 1000) / 1000 * (hi - lo);
  return Math.round(deg * 100) / 100;
}

/** Ready to spread onto a JSX element: `style={tiltStyle(id, "scrap")}`. */
export const tiltStyle = (key: string, lean: Lean = "card") =>
  ({ "--tilt": `${tilt(key, lean)}deg` }) as Record<string, string>;
