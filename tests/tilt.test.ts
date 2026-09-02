import { describe, it, expect } from "vitest";
import { tilt, type Lean } from "../src/lib/tilt";

const RANGES: Record<Lean, [number, number]> = {
  page: [-1.2, 1.2],
  card: [-1.4, 1.8],
  note: [-2.6, 3.4],
  scrap: [-4, 11],
};

describe("tilt", () => {
  it("is stable for a key, so nothing re-rotates between renders", () => {
    expect(tilt("line-3", "note")).toBe(tilt("line-3", "note"));
  });

  it("stays inside the band for every lean", () => {
    for (const [lean, [lo, hi]] of Object.entries(RANGES) as [Lean, [number, number]][]) {
      for (let i = 0; i < 1000; i += 1) {
        const d = tilt(`row-${i}-${i * 7}`, lean);
        expect(d, `${lean} ${i}`).toBeGreaterThanOrEqual(lo);
        expect(d, `${lean} ${i}`).toBeLessThanOrEqual(hi);
      }
    }
  });

  it("leans small scraps harder than full-width cards", () => {
    // The brief's -4..+11 belongs to scattered scraps; a full-width block at
    // that angle reads as broken rather than hand-placed.
    const scrap = Array.from({ length: 200 }, (_, i) => Math.abs(tilt(`k${i}`, "scrap")));
    const card = Array.from({ length: 200 }, (_, i) => Math.abs(tilt(`k${i}`, "card")));
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(scrap)).toBeGreaterThan(mean(card) * 2);
  });

  it("varies between keys, so nothing aligns perfectly", () => {
    const angles = new Set(Array.from({ length: 50 }, (_, i) => tilt(`k${i}`, "note")));
    expect(angles.size).toBeGreaterThan(20);
  });
});
