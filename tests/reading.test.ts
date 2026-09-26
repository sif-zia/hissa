import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { shapeReading } from "../api/_lib/reading";
import { clampPct } from "../api/_lib/http";
import { draftFrom, rememberedSteps, rememberSteps } from "../src/lib/reading";
import { compute, DEFAULT_STEPS } from "../src/lib/money";
import type { Extracted } from "../src/lib/api";
import { fakeStorage } from "./storage";

describe("shapeReading (server)", () => {
  const raw = {
    currency: "Rs",
    place: "  Kolachi   Do Darya  ",
    items: [{ name: "Biryani", qty: 2, price: 1800 }, { name: "", price: 0 }],
    adjustments: [
      { kind: "gst", pct: 16, amount: 480, step: 1 },
      { kind: "gst", pct: 5, amount: 150, step: 1 }, // a second GST row: first wins
      { kind: "service", pct: 10, amount: 300, step: 1 },
      { kind: "surcharge", pct: 3, amount: 90, step: 1 }, // not a kind
      { kind: "discount", pct: 0, amount: 0, step: 2 }, // carries nothing
      { kind: "tip", pct: 250, amount: -5, step: 9 },
    ],
    printedSubtotal: 1800,
    printedTotal: "2580",
  };
  const out = shapeReading(raw);

  it("keeps one of each known kind and drops rows with nothing in them", () => {
    expect(out.adjustments.map((a) => a.kind)).toEqual(["gst", "service", "tip"]);
    expect(out.adjustments[0]).toEqual({ kind: "gst", pct: 16, amount: 480, step: 1 });
  });
  it("clamps percentages and steps, and reads a negative amount as its size", () => {
    expect(out.adjustments[2]).toEqual({ kind: "tip", pct: 100, amount: 5, step: 4 });
  });
  it("reads a discount printed as -348 as 348", () => {
    const d = shapeReading({ adjustments: [{ kind: "discount", pct: 0, amount: -348, step: 2 }] });
    expect(d.adjustments[0]!.amount).toBe(348);
    expect(d.discount).toBe(348);
  });
  it("cleans the place and reads a string total", () => {
    expect(out.place).toBe("Kolachi Do Darya");
    expect(out.printedTotal).toBe(2580);
  });
  it("drops blank items", () => expect(out.items).toHaveLength(1));

  // An installed v1 app can outlive a deploy; it must still read a bill.
  it("keeps the v1 fields, with service riding in as tip", () => {
    expect(out.gstPct).toBe(16);
    expect(out.discount).toBe(0);
    expect(out.tip).toBe(5 + 300);
  });

  it("survives a model that returns junk", () => {
    const j = shapeReading({ items: "nope", adjustments: [null, 3], place: 7 });
    expect(j).toMatchObject({ items: [], adjustments: [], place: "", currency: "Rs", printedTotal: 0 });
  });

  it("flags lines that don't sum to the printed subtotal", () => {
    expect(shapeReading({ ...raw, printedSubtotal: 2500 }).suspect).toBe(true);
    expect(out.suspect).toBe(false);
  });
});

describe("clampPct", () => {
  it("keeps two decimals rather than rounding 17.5 to 18", () => expect(clampPct(17.5)).toBe(17.5));
  it("holds the range", () => {
    expect(clampPct(140)).toBe(100);
    expect(clampPct(-2)).toBe(0);
    expect(clampPct("x")).toBe(0);
  });
});

describe("draftFrom (client)", () => {
  let n = 0;
  const id = () => `i${(n += 1)}`;
  const reading = (over: Partial<Extracted> = {}): Extracted => ({
    currency: "Rs",
    place: "Kolachi",
    items: [{ name: "Karahi", qty: 1, price: 3000 }],
    adjustments: [
      { kind: "gst", pct: 16, amount: 0, step: 1 },
      { kind: "discount", pct: 10, amount: 0, step: 2 },
    ],
    printedTotal: 3132,
    ...over,
  });

  it("builds the bill and confirms the model's stacking against the printed total", () => {
    const { bill, fit } = draftFrom(reading(), id);
    expect(fit).toBe("match");
    expect(bill.steps).toEqual([["gst"], ["discount"]]);
    expect(compute(bill).total).toBe(313200);
    expect(bill.printedTotal).toBe(313200);
  });

  it("corrects a wrong stacking from the arithmetic", () => {
    // The model said gst, then discount (3132). The paper says 3180, which only
    // "all on the food" reaches: 3000 + 480 - 300.
    const { bill, fit } = draftFrom(reading({ printedTotal: 3180 }), id);
    expect(fit).toBe("match");
    expect(bill.steps).toEqual([["gst", "discount"]]);
  });

  it("says so when nothing fits", () => {
    expect(draftFrom(reading({ printedTotal: 9999 }), id).fit).toBe("none");
  });

  it("reads a flat discount as flat", () => {
    const { bill } = draftFrom(reading({
      adjustments: [{ kind: "discount", pct: 0, amount: 250, step: 1 }], printedTotal: 0,
    }), id);
    expect(bill.adj.discount).toEqual({ mode: "flat", val: "250" });
  });

  it("recovers a GST rate from an amount-only line", () => {
    const { bill } = draftFrom(reading({
      adjustments: [{ kind: "gst", pct: 0, amount: 480, step: 1 }], printedTotal: 3480,
    }), id);
    expect(bill.adj.gst.val).toBe("16");
  });

  it("never hands the editor an empty bill", () => {
    expect(draftFrom(reading({ items: [] }), id).bill.items).toHaveLength(1);
  });
});

describe("remembered stacking", () => {
  beforeEach(() => { vi.stubGlobal("localStorage", fakeStorage()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("defaults to the v1 rule", () => expect(rememberedSteps()).toEqual(DEFAULT_STEPS));
  it("comes back as it was left", () => {
    rememberSteps([["discount"], ["gst", "tip"]]);
    expect(rememberedSteps()).toEqual([["discount"], ["gst", "tip"]]);
  });
  it("ignores a corrupt or foreign value", () => {
    localStorage.setItem("hissa:steps", JSON.stringify([["gst", "vat"]]));
    expect(rememberedSteps()).toEqual(DEFAULT_STEPS);
  });
});
