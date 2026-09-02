import { describe, it, expect } from "vitest";
import { tilt } from "../src/lib/tilt";

describe("tilt", () => {
  it("is stable for a key, so nothing re-rotates between renders", () => {
    expect(tilt("line-3")).toBe(tilt("line-3"));
  });

  it("stays inside the -4..+11 degree band for any key", () => {
    for (let i = 0; i < 2000; i += 1) {
      const d = tilt(`row-${i}-${i * 7}`);
      expect(d).toBeGreaterThanOrEqual(-4);
      expect(d).toBeLessThanOrEqual(11);
    }
  });

  it("varies between keys, so nothing aligns perfectly", () => {
    const angles = new Set(Array.from({ length: 50 }, (_, i) => tilt(`k${i}`)));
    expect(angles.size).toBeGreaterThan(20);
  });

  it("narrows the band when a smaller spread is asked for", () => {
    for (let i = 0; i < 200; i += 1) {
      const d = tilt(`dense-${i}`, 0.3);
      expect(d).toBeGreaterThanOrEqual(-4);
      expect(d).toBeLessThanOrEqual(0.5);
    }
  });
});
