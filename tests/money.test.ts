import { describe, it, expect } from "vitest";
import {
  num, cents, fmt, priceOf, compute, normalise, arrangements, outcomes, sentence, detect, apply,
  DEFAULT_STEPS, noAdj, type DraftBill, type AmountMode, type Kind, type Steps,
} from "../src/lib/money";

/**
 * v1-shaped fixtures (gst / discount / tip fields), mapped onto the v2 bill
 * under the default steps. Every v1 case below must still hold unchanged:
 * that is what "the default is today's rule" means.
 */
type V1 = Partial<Omit<DraftBill, "adj">> & {
  gst?: string;
  discount?: { mode: AmountMode; val: string };
  tip?: { mode: AmountMode; val: string };
  service?: { mode: AmountMode; val: string };
};
const bill = ({ gst, discount, tip, service, ...over }: V1 = {}): DraftBill => {
  const adj = noAdj();
  if (gst) adj.gst = { mode: "pct", val: gst };
  if (discount) adj.discount = discount;
  if (tip) adj.tip = tip;
  if (service) adj.service = service;
  return {
    currency: "Rs",
    priceMode: "total",
    items: [{ id: "a", name: "Wrap", qty: "7", price: "6790" }],
    adj,
    steps: DEFAULT_STEPS,
    ...over,
  };
};

describe("parsing", () => {
  it("strips thousands separators", () => expect(num("6,790.50")).toBe(6790.5));
  it("treats junk as zero rather than NaN", () => expect(num("--")).toBe(0));
  it("converts to minor units", () => expect(cents("6790.50")).toBe(679050));
  it("rounds sub-paisa input instead of truncating", () => expect(cents("10.005")).toBe(1001));
});

describe("formatting", () => {
  it("groups thousands", () => expect(fmt(679050, "Rs")).toBe("Rs 6,791"));
  it("keeps decimals when asked", () => expect(fmt(679050, "Rs", true)).toBe("Rs 6,790.50"));
  it("puts the sign before the currency", () => expect(fmt(-50000, "Rs")).toBe("-Rs 500"));
});

describe("price mode", () => {
  const it7 = { id: "a", name: "Wrap", qty: "7", price: "970" };
  it("takes the price as the line total by default", () =>
    expect(priceOf(it7, "total")).toBe(97000));
  it("multiplies by quantity in 'each' mode", () =>
    expect(priceOf(it7, "each")).toBe(679000));
});

describe("bill totals", () => {
  it("skips blank rows but keeps priced ones", () => {
    const t = compute(bill({ items: [
      { id: "a", name: "Wrap", qty: "1", price: "100" },
      { id: "b", name: "", qty: "1", price: "" },
      { id: "c", name: "", qty: "1", price: "50" },
    ] }));
    expect(t.lines).toHaveLength(2);
    expect(t.subtotal).toBe(15000);
  });

  it("applies GST to the subtotal", () => {
    const t = compute(bill({ items: [{ id: "a", name: "X", qty: "1", price: "1000" }], gst: "8" }));
    expect(t.gstAmt).toBe(8000);
    expect(t.total).toBe(108000);
  });

  // Spec §3.1: discount and tip both hang off the POST-GST amount, not the subtotal.
  it("applies a percentage discount to the post-GST amount", () => {
    const t = compute(bill({
      items: [{ id: "a", name: "X", qty: "1", price: "1000" }],
      gst: "8",
      discount: { mode: "pct", val: "10" },
    }));
    expect(t.discountAmt).toBe(10800); // 10% of 1080, not of 1000
    expect(t.total).toBe(97200);
  });

  it("applies a percentage tip to the post-GST amount", () => {
    const t = compute(bill({
      items: [{ id: "a", name: "X", qty: "1", price: "1000" }],
      gst: "8",
      tip: { mode: "pct", val: "10" },
    }));
    expect(t.tipAmt).toBe(10800);
    expect(t.total).toBe(118800);
  });

  it("subtracts discount and adds tip in the same pass", () => {
    const t = compute(bill({
      items: [{ id: "a", name: "X", qty: "1", price: "1000" }],
      gst: "10",
      discount: { mode: "flat", val: "100" },
      tip: { mode: "flat", val: "50" },
    }));
    expect(t.total).toBe(110000 - 10000 + 5000);
  });

  it("has a zero subtotal for an empty bill, which is what gates the exit buttons", () => {
    expect(compute(bill({ items: [] })).subtotal).toBe(0);
  });
});

/* ------------------------------------------------------------ v2 stacking */

const food = [{ id: "a", name: "X", qty: "1", price: "3000" }];
const pct = (val: string) => ({ mode: "pct" as const, val });
const flat = (val: string) => ({ mode: "flat" as const, val });
const three = (steps: Steps) =>
  bill({ items: food, gst: "16", discount: pct("10"), tip: pct("5"), steps });

describe("stacking steps", () => {
  it("all on the food: every % of the subtotal", () => {
    const t = compute(three([["gst", "discount", "tip"]]));
    expect([t.gstAmt, t.discountAmt, t.tipAmt]).toEqual([48000, 30000, 15000]);
    expect(t.total).toBe(333000);
  });

  it("gst first, then discount & tip (the v1 rule)", () => {
    const t = compute(three(DEFAULT_STEPS));
    expect(t.bases.discount).toBe(348000);
    expect(t.total).toBe(300000 + 48000 - 34800 + 17400);
  });

  it("gives the same total in any order when every row is a percentage", () => {
    const orders: Steps[] = [
      [["gst"], ["discount"], ["tip"]],
      [["tip"], ["gst"], ["discount"]],
      [["discount"], ["tip"], ["gst"]],
    ];
    const totals = orders.map((o) => compute(three(o)).total);
    // Rounding happens per row, so allow a paisa or two of drift.
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(2);
  });

  it("lets order matter once a flat amount is in the chain", () => {
    const b = (steps: Steps) => bill({ items: food, gst: "16", discount: flat("500"), steps });
    expect(compute(b([["discount"], ["gst"]])).total).toBe(250000 + 40000);
    expect(compute(b([["gst"], ["discount"]])).total).toBe(348000 - 50000);
  });

  it("holds a discount bigger than the bill at zero, and says so", () => {
    const t = compute(bill({ items: food, discount: flat("5000") }));
    expect(t.total).toBe(0);
    expect(t.clamped).toBe(true);
  });

  it("keeps every amount an integer", () => {
    const t = compute(bill({
      items: [{ id: "a", name: "X", qty: "1", price: "1234.57" }],
      gst: "17.5", service: pct("7.25"), discount: pct("12.5"), tip: pct("3.3"),
      steps: [["service"], ["gst"], ["discount", "tip"]],
    }));
    for (const v of [t.total, ...Object.values(t.amts), ...Object.values(t.bases)]) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("carries service charge on the food with gst by default", () => {
    const t = compute(bill({ items: food, gst: "16", service: pct("10") }));
    expect(t.serviceAmt).toBe(30000);
    expect(t.bases.gst).toBe(300000);
    expect(t.total).toBe(300000 + 30000 + 48000);
  });
});

describe("normalise", () => {
  it("drops empty rows and closes up empty steps", () => {
    expect(normalise([["gst"], ["discount"], ["tip"]], ["gst", "tip"])).toEqual([["gst"], ["tip"]]);
  });
  it("puts an extra the steps don't mention where v1 would", () => {
    expect(normalise([["gst"], ["discount"]], ["gst", "discount", "tip", "service"]))
      .toEqual([["service", "gst"], ["discount", "tip"]]);
  });
  it("starts from nothing", () => {
    expect(normalise([], ["tip"])).toEqual([["tip"]]);
  });
  it("orders rows inside a step canonically, since they commute", () => {
    expect(normalise([["tip", "gst"]], ["gst", "tip"])).toEqual([["gst", "tip"]]);
  });
});

describe("arrangements", () => {
  it("counts ordered set partitions", () => {
    const k: Kind[] = ["service", "gst", "discount", "tip"];
    expect([0, 1, 2, 3, 4].map((n) => arrangements(k.slice(0, n)).length)).toEqual([1, 1, 3, 13, 75]);
  });
  it("uses every kind exactly once in each", () => {
    for (const st of arrangements(["gst", "discount", "tip"])) {
      expect(st.flat().sort()).toEqual(["discount", "gst", "tip"]);
    }
  });
});

describe("outcomes", () => {
  it("collapses three % rows to exactly five distinct totals", () => {
    const { visible, more } = outcomes(three(DEFAULT_STEPS), 99);
    expect(visible.length + more.length).toBe(5);
  });

  it("shows at most four, with the rest under 'more ways'", () => {
    const b = bill({
      items: food, gst: "16", service: pct("10"), discount: pct("10"), tip: pct("5"),
    });
    const { visible, more } = outcomes(b);
    expect(visible).toHaveLength(4);
    expect(more.length).toBeGreaterThan(0);
  });

  it("has a single outcome when there is nothing to decide", () => {
    const n = (b: DraftBill) => { const o = outcomes(b); return o.visible.length + o.more.length; };
    expect(n(bill({ items: food }))).toBe(1);
    expect(n(bill({ items: food, gst: "16" }))).toBe(1);
    expect(n(bill({ items: food, discount: flat("100"), tip: flat("50") }))).toBe(1);
  });

  it("puts the bill-matching outcome first and marks the current one", () => {
    const b = { ...three([["gst", "discount", "tip"]]), printedTotal: 330600 };
    const { visible } = outcomes(b);
    expect(visible[0]!.matches).toBe(true);
    expect(visible[0]!.total).toBe(330600);
    expect(visible.find((o) => o.current)!.total).toBe(333000);
  });

  it("represents a total by its plainest arrangement", () => {
    // Flat amounts ignore their base, so all 3 arrangements tie; one step wins.
    const { visible } = outcomes(bill({ items: food, discount: flat("100"), tip: flat("50") }));
    expect(visible[0]!.steps).toEqual([["discount", "tip"]]);
  });

  it("words the selected option exactly as the stacking in use", () => {
    // Percentages commute, so "discount & tip, then gst" ties with the default.
    const { visible } = outcomes(three(DEFAULT_STEPS));
    expect(visible.find((o) => o.current)!.steps).toEqual([["gst"], ["discount", "tip"]]);
  });

  it("breaks ties by the rows' fixed order, not the alphabet", () => {
    const { visible, more } = outcomes(three([["gst", "discount", "tip"]]), 99);
    const tie = [...visible, ...more].find((o) => o.total === 330600)!;
    expect(tie.steps).toEqual([["gst"], ["discount", "tip"]]);
  });

  it("keeps a three-step chain as its own outcome when its total is distinct", () => {
    const all = outcomes(three(DEFAULT_STEPS), 99);
    expect([...all.visible, ...all.more].some((o) => o.steps.length === 3)).toBe(true);
  });
});

describe("sentence", () => {
  const a = noAdj();
  a.gst.val = "16"; a.discount = pct("10"); a.tip = pct("5");
  it("reads a single step", () => expect(sentence([["gst", "tip"]], a)).toBe("all on the food"));
  it("reads steps in order", () =>
    expect(sentence([["gst"], ["discount", "tip"]], a)).toBe("gst on the food, then discount & tip"));
  it("calls a chain of singles one after another", () =>
    expect(sentence([["gst"], ["discount"], ["tip"]], a)).toBe("one after another"));
  it("names the order when a flat amount makes it matter", () => {
    const f = { ...a, discount: flat("500") };
    expect(sentence([["discount"], ["gst"], ["tip"]], f)).toBe("one after another: discount → gst → tip");
  });
  it("keeps two singles as a plain then", () =>
    expect(sentence([["discount"], ["gst"]], a)).toBe("discount on the food, then gst"));
});

describe("detect", () => {
  const b = (printedTotal?: number) => ({ ...three(DEFAULT_STEPS), printedTotal });

  it("accepts the model's steps when they reproduce the printed total within a rupee", () => {
    const r = detect(b(330600 + 60), [["gst"], ["discount", "tip"]]);
    expect(r).toEqual({ steps: [["gst"], ["discount", "tip"]], fit: "match" });
  });

  it("finds the right stacking when the model's is wrong", () => {
    const r = detect(b(333000), [["gst"], ["discount", "tip"]]);
    expect(r.fit).toBe("match");
    expect(apply(300000, three(DEFAULT_STEPS).adj, r.steps).total).toBe(333000);
    expect(r.steps).toEqual([["gst", "discount", "tip"]]);
  });

  it("keeps the model's steps and says so when nothing fits", () => {
    const r = detect(b(999999), [["gst"], ["discount", "tip"]]);
    expect(r).toEqual({ steps: [["gst"], ["discount", "tip"]], fit: "none" });
  });

  it("takes the model's word when no total was printed", () => {
    expect(detect(b(undefined), [["gst", "discount", "tip"]]).fit).toBe("unknown");
  });
});
