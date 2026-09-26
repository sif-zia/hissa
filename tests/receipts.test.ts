import { describe, it, expect } from "vitest";
import { draftFrom } from "../src/lib/reading";
import { compute, sentence, type Steps } from "../src/lib/money";
import type { Extracted } from "../src/lib/api";

/*
 * Real gemini-3.1-flash-lite answers (via /api/extract, 2026-09-26) for six
 * synthetic receipts, each printed with a known stacking. The model is right
 * about the stacking five times out of six; the arithmetic has to settle all
 * six. Items are the same three lines (subtotal 3000) unless noted.
 */
const items = [
  { name: "Chicken Karahi", qty: 1, price: 1800 },
  { name: "Garlic Naan", qty: 4, price: 400 },
  { name: "Mint Lemonade", qty: 2, price: 800 },
];
type A = Extracted["adjustments"];
const r = (place: string, adjustments: A, printedTotal: number, it = items): Extracted =>
  ({ currency: "PKR", place, items: it, adjustments, printedTotal });

const cases: [string, Extracted, Steps][] = [
  ["gst, then discount on the post-tax amount",
    r("KOLACHI", [{ kind: "gst", pct: 16, amount: 480, step: 1 }, { kind: "discount", pct: 10, amount: 348, step: 2 }], 3132),
    [["gst"], ["discount"]]],
  ["discount first, then gst on what is left",
    r("BUTT KARAHI", [{ kind: "discount", pct: 10, amount: 300, step: 1 }, { kind: "gst", pct: 16, amount: 432, step: 2 }], 3132),
    [["discount"], ["gst"]]],
  ["service and gst both on the food",
    r("MONAL", [{ kind: "service", pct: 10, amount: 300, step: 1 }, { kind: "gst", pct: 16, amount: 480, step: 1 }], 3780),
    [["service", "gst"]]],
  ["a flat discount",
    r("CAFE AYLANTO", [{ kind: "gst", pct: 5, amount: 150, step: 1 }, { kind: "discount", pct: 0, amount: 500, step: 1 }], 2650),
    [["gst", "discount"]]],
  // The one the model got wrong: it put the tip on the subtotal (step 1).
  ["a printed tip on the post-tax amount",
    r("SALT'N PEPPER", [{ kind: "gst", pct: 16, amount: 480, step: 1 }, { kind: "tip", pct: 10, amount: 348, step: 1 }], 3828),
    [["gst"], ["tip"]]],
  ["no tax at all",
    r("CHAI WALA", [], 750, [{ name: "Doodh Patti", qty: 3, price: 450 }, { name: "Samosa", qty: 6, price: 300 }]),
    []],
];

describe("detection against real extractions", () => {
  let n = 0;
  const id = () => `r${(n += 1)}`;
  for (const [what, reading, want] of cases) {
    it(what, () => {
      const { bill, fit } = draftFrom(reading, id);
      const t = compute(bill);
      expect(t.total).toBe(reading.printedTotal * 100);
      expect(fit).toBe("match");
      expect(t.steps).toEqual(want);
      expect(sentence(t.steps, bill.adj)).toBeTruthy();
    });
  }
});
