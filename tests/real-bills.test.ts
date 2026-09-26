import { describe, it, expect } from "vitest";
import { draftFrom } from "../src/lib/reading";
import { compute, sentence } from "../src/lib/money";
import type { Extracted } from "../src/lib/api";

/*
 * Real gemini-3.1-flash-lite answers (via /api/extract, 2026-09-26) for ten
 * photographed bills in test_bills/ (gitignored: photos are never committed).
 * What each bill is testing:
 *   1  La Cabana      tax as an amount only; a "pay with cash" line below the total
 *   2  Urban Tarka    13% sales tax
 *   3  Kabul          service charge only, printed as an amount
 *   4  Saltanat       15% SST, an empty TIP line
 *   5  Nexxt Cafe     tax as an amount; "suggested gratuity" lines that are not a tip
 *   6  Mandi House    13% SST
 *   7  (no name)      15% printed, 418 charged on 2,795 (15% would be 419.25)
 *   8  Pizza Online   no subtotal printed; PST as an amount
 *   9  (address only) 15% SST plus a Rs 1 "POS service" fee
 *   10 Freddy's       50% discount, 6% tax, 5% service: the printed numbers do not
 *                     reach the printed total by any reading, so the editor must say so
 */
const bills: Record<string, Extracted> = {
  "bill-1": {"currency":"$","place":"La Cabaña","items":[{"name":"Dos Tacos (Brunch)","qty":1,"price":18},{"name":"6. Taco y Enchilada (Super Combo)","qty":1,"price":21.95},{"name":"Brunch Reg Lime Margarita","qty":1,"price":12.75}],"adjustments":[{"kind":"gst","pct":0,"amount":5.01,"step":1}],"printedTotal":57.71},
  "bill-2": {"currency":"PKR","place":"URBAN TARKA","items":[{"name":"CHICKEN CHOWMEIN","qty":1,"price":560},{"name":"PARATHA","qty":2,"price":180},{"name":"RICE PLATTER HALF","qty":1,"price":1100},{"name":"KOYLA KARAHI HALF","qty":1,"price":860},{"name":"PLAIN NAAN","qty":1,"price":40},{"name":"SOFTDRINK","qty":5,"price":450},{"name":"MINERAL WATER LARGE","qty":1,"price":90},{"name":"BBQ WINGS","qty":1,"price":370},{"name":"SALAD","qty":1,"price":120}],"adjustments":[{"kind":"gst","pct":13,"amount":490,"step":1}],"printedTotal":4260},
  "bill-3": {"currency":"Rs","place":"KABUL RESTAURANT","items":[{"name":"QABLI PULAO","qty":1,"price":1150},{"name":"CHELAW KEBAB","qty":1,"price":1150},{"name":"AFGHANI NAN","qty":1,"price":60},{"name":"CHATNI","qty":1,"price":150},{"name":"MINERAL WATER 1.5 LTR","qty":1,"price":160},{"name":"COKE","qty":2,"price":300}],"adjustments":[{"kind":"service","pct":0,"amount":207.9,"step":1}],"printedTotal":3177.9},
  "bill-4": {"currency":"PKR","place":"SALTANAT","items":[{"name":"CHICKEN CORN SOUP","qty":1,"price":449},{"name":"EVERGREEN CHICKEN CHOWMEIN","qty":1,"price":1499}],"adjustments":[{"kind":"gst","pct":15,"amount":292.2,"step":1}],"printedTotal":2240.2},
  "bill-5": {"currency":"$","place":"NEXXT CAFE","items":[{"name":"COFFEE","qty":1,"price":3.95},{"name":"CHORIZO AND AVO","qty":1,"price":13.5},{"name":"CHICKEN&WAFFLES","qty":1,"price":13.95}],"adjustments":[{"kind":"gst","pct":0,"amount":2.83,"step":1}],"printedTotal":34.23},
  "bill-6": {"currency":"Rs","place":"MANDI HOUSE","items":[{"name":"MUTTON MADFOON 1 PERSON","qty":1,"price":2450},{"name":"MIXED GRILL","qty":1,"price":3000},{"name":"CHAPATI","qty":2,"price":110},{"name":"GARLIC NAAN","qty":3,"price":330},{"name":"KUNAFA","qty":1,"price":950},{"name":"LARGE WATER","qty":1,"price":180},{"name":"RIZ ALA DAJAJ 2 PERSON","qty":1,"price":3300}],"adjustments":[{"kind":"gst","pct":13,"amount":1341.6,"step":1}],"printedTotal":11661.6},
  "bill-7": {"currency":"Rs","place":"","items":[{"name":"DOODH PATTI","qty":2,"price":270},{"name":"SPICY MEXICAN FRIES","qty":1,"price":395},{"name":"CLASSIC CLUB CHICKEN SANDWICH","qty":1,"price":945},{"name":"CHICKEN BOTI MAYO GARLIC ROLL","qty":2,"price":790},{"name":"CHICKEN BOTI MAYO GARLIC ROLL","qty":1,"price":395}],"adjustments":[{"kind":"gst","pct":15,"amount":418,"step":1}],"printedTotal":3213},
  "bill-8": {"currency":"Rs","place":"PIZZA ONLINE","items":[{"name":"Water (L)","qty":1,"price":103.45},{"name":"Deal 7 Chicken Special (L), Kabab Stuffer (M), Next Cola 1.5","qty":1,"price":3094.83},{"name":"Fries (L)","qty":1,"price":405.17}],"adjustments":[{"kind":"gst","pct":0,"amount":576.55,"step":1}],"printedTotal":4180},
  "bill-9": {"currency":"Rs","place":"JINNAH AVENUE ROAD PLOT #2, MODEL COLONY","items":[{"name":"SCHEZWAN SC UP MEDIUM","qty":1,"price":875},{"name":"AMERICAN CHOPSUEY","qty":1,"price":1585},{"name":"VEGETABLE FRIED RICE - LARGE","qty":1,"price":1395},{"name":"BLACK PEPPER CHICKEN LARGE","qty":1,"price":1595},{"name":"Mineral Water Glass Bottle","qty":2,"price":360}],"adjustments":[{"kind":"gst","pct":15,"amount":871,"step":1},{"kind":"service","pct":0,"amount":1,"step":1}],"printedTotal":6682},
  "bill-10": {"currency":"Rs","place":"Freddy's Cafe'","items":[{"name":"FREDDYS CLUB SANDWICH","qty":1,"price":1690},{"name":"FISH N CHIPS","qty":1,"price":2645},{"name":"THREE LEAF THAI CHICKEN","qty":1,"price":2490},{"name":"FREDDYS LITTLE ALASKA","qty":1,"price":895},{"name":"LEMONADE","qty":3,"price":1050}],"adjustments":[{"kind":"gst","pct":6,"amount":537,"step":2},{"kind":"discount","pct":50,"amount":3938,"step":1},{"kind":"service","pct":5,"amount":394,"step":2}],"printedTotal":5606},

};

describe("real bills", () => {
  let n = 0;
  const id = () => `b${(n += 1)}`;

  for (const [name, reading] of Object.entries(bills)) {
    if (name === "bill-10") continue;
    it(`${name} (${reading.place || "no name"}) settles on its printed total`, () => {
      const { bill, fit } = draftFrom(reading, id);
      expect(fit).toBe("match");
      expect(Math.abs(compute(bill).total - Math.round(reading.printedTotal * 100))).toBeLessThanOrEqual(100);
      expect(sentence(compute(bill).steps, bill.adj)).toBeTruthy();
    });
  }

  it("bill-7 falls back to what was charged when the printed rate doesn't reach the total", () => {
    const { bill } = draftFrom(bills["bill-7"]!, id);
    expect(compute(bill).gstAmt).toBe(41813);
    expect(compute(bill).total).toBe(321313);
  });

  it("bill-10 does not reconcile, and is reported rather than forced", () => {
    const { bill, fit } = draftFrom(bills["bill-10"]!, id);
    expect(fit).toBe("none");
    expect(bill.printedTotal).toBe(560600);
    expect(compute(bill).total).not.toBe(560600);
  });

  it("never reads a suggested gratuity or a cash price as an extra", () => {
    expect(bills["bill-5"]!.adjustments.map((a) => a.kind)).toEqual(["gst"]);
    expect(bills["bill-1"]!.adjustments.map((a) => a.kind)).toEqual(["gst"]);
  });
});
