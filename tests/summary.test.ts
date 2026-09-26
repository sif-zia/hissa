import { describe, it, expect } from "vitest";
import { billSummary, equalSummary, summaryText, fraction, shortDate } from "../src/lib/summary";
import { spread, shareOf, type BillMeta, type Person } from "../src/lib/split";

const meta = (over: Partial<BillMeta> = {}): BillMeta => ({
  code: "", billName: "kolachi", currency: "Rs",
  lines: [
    { id: "k", name: "karahi", qty: 1, amt: 180000 },
    { id: "n", name: "naan", qty: 4, amt: 40000 },
    { id: "c", name: "chai", qty: 3, amt: 45000 },
  ],
  subtotal: 265000, gstPct: 16, gstAmt: 42400, serviceAmt: 0, discountAmt: 0, tipAmt: 0,
  total: 307400, splitUnclaimed: false,
  at: new Date(2026, 8, 26, 20).getTime(),
  ...over,
});
const people = (): Person[] => [
  { key: "faraz", name: "faraz", claims: { k: 1, n: 1 } },
  { key: "sara", name: "sara", claims: { k: 1, c: 2 } },
];

describe("fraction", () => {
  it("reduces and writes plain digits", () => {
    expect(fraction(1, 2)).toBe("1/2");
    expect(fraction(2, 4)).toBe("1/2");
    expect(fraction(2, 5)).toBe("2/5");
    expect(fraction(2, 3)).toBe("2/3");
  });
  it("says nothing for a whole line", () => {
    expect(fraction(3, 3)).toBe("");
    expect(fraction(1, 1)).toBe("");
  });
});

describe("shortDate", () => {
  it("writes sat 26 sep, not Sept", () => expect(shortDate(new Date(2026, 8, 26).getTime())).toBe("sat 26 sep"));
});

describe("billSummary", () => {
  it("uses the same numbers as the screen", () => {
    const m = meta();
    const s = billSummary(m, people(), {}, false);
    const { subShare } = spread(m, people());
    expect(s.rows.map((r) => r.amt)).toEqual(people().map((p) => shareOf(m, subShare[p.key] ?? 0)));
  });

  it("breaks each person down into items that add up to their number", () => {
    const s = billSummary(meta(), people(), {}, true);
    for (const r of s.rows) expect(r.items!.reduce((a, i) => a + i.amt, 0)).toBe(r.amt);
    expect(s.rows[0]!.items![0]).toEqual({ name: "karahi", frac: "1/2", amt: 90000 });
    expect(s.rows[0]!.items!.at(-1)!.name).toBe("extras");
  });

  it("notes what nobody claimed, and hands out leftovers when shared", () => {
    const loose = billSummary(meta(), [{ key: "a", name: "a", claims: { k: 1 } }], {}, true);
    expect(loose.note).toBe("nobody's claimed Rs 986.00");
    const shared = billSummary(meta({ splitUnclaimed: true }), [{ key: "a", name: "a", claims: { k: 1 } }], {}, true);
    expect(shared.note).toBeUndefined();
    expect(shared.rows[0]!.items!.find((i) => i.name === "leftovers")!.amt).toBe(85000);
  });
});

describe("summaryText", () => {
  it("is plain lines, totals only", () => {
    expect(summaryText(billSummary(meta(), people(), {}, false), "hissa.itisamzia.dev")).toBe(
      [
        "kolachi · sat 26 sep",
        "faraz — Rs 1,508.00",
        "sara — Rs 1,566.00",
        "total Rs 3,074.00",
        "",
        "split with hissa · hissa.itisamzia.dev",
      ].join("\n"),
    );
  });

  it("indents the items when asked", () => {
    const t = summaryText(billSummary(meta(), people(), {}, true), "x");
    expect(t).toContain("\n  karahi 1/2 · Rs 900.00\n");
    expect(t).toContain("\n  chai · Rs 450.00\n");
  });
});

describe("equalSummary", () => {
  it("says who pays the extra paisa", () => {
    const s = equalSummary(330601, 3, "Rs", 0);
    expect(summaryText(s, "x").split("\n").slice(1, 4)).toEqual([
      "each of 3 — Rs 1,102.00", "total Rs 3,306.01", "1 person pays Rs 1,102.01",
    ]);
  });
  it("divides cleanly without a note", () => expect(equalSummary(300, 3, "Rs", 0).note).toBeUndefined());
});
