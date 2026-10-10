import { describe, it, expect } from "vitest";
import { draftFrom } from "../src/lib/reading";
import { compute } from "../src/lib/money";
import type { Extracted } from "../src/lib/api";

/*
 * 27 Pakistani bills from Google Images ("cafe lahore long bill receipt",
 * 2026-10-10), transcribed by hand from the photos: subtotal, every printed
 * extra (rate and amount as printed) and the printed total. Every extra is
 * given step 1, the least helpful thing a model can say, so the arithmetic
 * alone has to settle each one. What they taught PRESETS (money.ts):
 *   - 21 put every extra on the subtotal; 3 have no extras at all
 *   - 2 print GST that is already inside the total (8, 13)
 *   - 1, Freddy's, reaches its total by no reading and is balanced (14)
 *   - 19 reads as service then 5% GST on the service-inclusive amount by its
 *     rates (Rs 1.14 out), but its printed amounts land exactly on the subtotal
 */
type A = Extracted["adjustments"][number];
const gst = (pct: number, amount: number): A => ({ kind: "gst", pct, amount, step: 1 });
const svc = (pct: number, amount: number): A => ({ kind: "service", pct, amount, step: 1 });
const off = (pct: number, amount: number): A => ({ kind: "discount", pct, amount, step: 1 });
const bill = (place: string, subtotal: number, adjustments: A[], printedTotal: number): Extracted =>
  ({ currency: "Rs", place, items: [{ name: "food", qty: 1, price: subtotal }], adjustments, printedTotal });

const bills: Extracted[] = [
  bill("Chai Sangat", 1113, [gst(16, 178.08)], 1291),
  bill("Cafe Strada", 9655, [gst(15, 1448.25), off(10, 965.5), svc(0, 965)], 11103.75),
  bill("DUMx (cash)", 5647, [gst(16, 903)], 6550),
  bill("DUMx (card)", 5647, [gst(5, 282.35), svc(0, 118.58)], 6047.93),
  bill("Shehwar", 3732, [], 3732),
  bill("Cheezious", 3750, [], 3750),
  bill("Boon's Cafe", 5680, [gst(16, 908.8)], 6588.8),
  bill("Drop Coffee", 3160, [off(0, 500), gst(8, 197.04)], 2660),
  bill("De Brando", 24600.65, [gst(16, 3936.1)], 28536.75),
  bill("Cafe Euphoria", 1720, [gst(16, 275.2)], 1995.2),
  bill("Chai Studio", 1814, [gst(16, 290)], 2104),
  bill("Bandu Khan", 6760, [gst(16, 1082)], 7842),
  bill("(grip.pk takeaway)", 1440, [gst(16, 198.62)], 1440),
  bill("Freddy's Cafe", 8770, [gst(6, 537), off(50, 3938), svc(5, 394)], 5606),
  bill("(DHA sale invoice)", 5613, [gst(16, 898)], 6511),
  bill("Pepe's Piri Piri", 2515, [gst(16, 402.4)], 2917.4),
  bill("Nisar Charsi Tikka", 1780, [gst(16, 285)], 2065),
  bill("Tim Hortons", 2000, [gst(16, 320)], 2320),
  bill("(order 95)", 10255, [svc(5, 513), gst(5, 538)], 11305),
  bill("Napoli", 3680, [gst(16, 589)], 4268.8),
  bill("Coffee, Tea & Company", 3506, [gst(5, 175)], 3681),
  bill("(preliminary estimate)", 840, [gst(16, 134)], 974),
  bill("(bizmatic)", 2499, [gst(16, 399.84)], 2898.84),
  bill("Rehmat-e-Shereen", 3610, [gst(15, 541.5)], 4152),
  bill("(broast)", 1240, [], 1240),
  bill("Savour Foods", 1530, [gst(16, 245)], 1775),
  bill("Shangrila", 5600, [svc(0, 560)], 6160),
];

describe("Pakistani bills", () => {
  let n = 0;
  const id = () => `pk${(n += 1)}`;
  const read = bills.map((b) => ({ b, ...draftFrom(b, id) }));

  for (const { b, bill: d, fit } of read) {
    it(`${b.place} splits exactly what was paid`, () => {
      expect(fit).not.toBe("unknown");
      expect(Math.abs(compute(d).total - Math.round(b.printedTotal * 100))).toBeLessThanOrEqual(100);
    });
  }

  it("reconciles at least 90% without a difference row", () => {
    const matched = read.filter((r) => r.fit === "match").length;
    expect(matched / read.length).toBeGreaterThanOrEqual(0.9);
    expect(read.filter((r) => r.fit === "balanced").map((r) => r.b.place)).toEqual(["Freddy's Cafe"]);
  });

  it("puts every extra on the subtotal for the commonest bill", () => {
    const strada = read.find((r) => r.b.place === "Cafe Strada")!;
    expect(compute(strada.bill).steps).toEqual([["service", "gst", "discount"]]);
  });

  it("reads GST under a total that doesn't add it as already in the prices", () => {
    for (const place of ["Drop Coffee", "(grip.pk takeaway)"]) {
      const r = read.find((x) => x.b.place === place)!;
      expect(r.fit).toBe("match");
      expect(r.bill.adj.gst.val).toBe("");
    }
  });
});
