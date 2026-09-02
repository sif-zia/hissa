import { hash } from "./identity";

/**
 * Deterministic rotation from a stable key, roughly -4deg..+11deg.
 *
 * Deliberately not random: a tilt that changes between renders is nauseating
 * to look at and costs a repaint every time. Same key, same angle, forever.
 * Always applied as a transform, never as a layout offset.
 */
export function tilt(key: string, spread = 1): number {
  const h = hash(key);
  const deg = -4 + ((h % 1500) / 100) * spread;
  return Math.round(deg * 100) / 100;
}

/** Ready to spread onto a JSX element: `style={tiltStyle(id)}`. */
export const tiltStyle = (key: string, spread = 1) =>
  ({ "--tilt": `${tilt(key, spread)}deg` }) as Record<string, string>;
