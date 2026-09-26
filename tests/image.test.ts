import { describe, it, expect } from "vitest";
import { frameCoords } from "../src/lib/image";

// A tall phone element over a landscape 1920x1440 frame: cover crops the sides.
const tall = { left: 0, top: 0, width: 390, height: 844 };

describe("frameCoords", () => {
  it("maps the centre of the element to the centre of the frame", () => {
    expect(frameCoords({ x: 195, y: 422 }, tall, 1920, 1440)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("accounts for the cropped sides of a cover-fit landscape frame", () => {
    // Displayed frame is 844 * 1920/1440 = 1125.3 wide; the element shows its
    // middle 390px, so the left edge of the element is ~32.7% into the frame.
    const p = frameCoords({ x: 0, y: 422 }, tall, 1920, 1440);
    expect(p.x).toBeCloseTo((1125.33 - 390) / 2 / 1125.33, 3);
    expect(p.y).toBe(0.5);
  });

  it("accounts for cropped top and bottom when the element is wider", () => {
    const wide = { left: 10, top: 20, width: 800, height: 300 };
    const p = frameCoords({ x: 410, y: 20 }, wide, 1080, 1920);
    expect(p.x).toBeCloseTo(0.5, 5);
    expect(p.y).toBeCloseTo((1422.2 - 300) / 2 / 1422.2, 3);
  });

  it("stays inside 0-1 for taps at or past the corners", () => {
    for (const t of [{ x: -50, y: -50 }, { x: 999, y: 999 }, { x: 0, y: 0 }, { x: 390, y: 844 }]) {
      const p = frameCoords(t, tall, 1920, 1440);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
  });
});
