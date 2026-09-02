import { describe, it, expect } from "vitest";
import { num, cents, fmt, priceOf, compute, type DraftBill } from "../src/lib/money";

const bill = (over: Partial<DraftBill> = {}): DraftBill => ({
  currency: "Rs",
  priceMode: "total",
  items: [{ id: "a", name: "Wrap", qty: "7", price: "6790" }],
  gst: "",
  discount: { mode: "flat", val: "" },
  tip: { mode: "flat", val: "" },
  ...over,
});

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
