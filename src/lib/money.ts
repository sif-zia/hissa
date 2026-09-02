/**
 * Money is integer minor units (paisa/cents) everywhere. Floats appear only
 * here, at parse time. Spec §3.
 */

export type PriceMode = "total" | "each";
export type AmountMode = "flat" | "pct";

export interface DraftItem {
  id: string;
  name: string;
  qty: string;
  price: string;
}

export interface DraftBill {
  currency: string;
  priceMode: PriceMode;
  items: DraftItem[];
  gst: string;
  discount: { mode: AmountMode; val: string };
  tip: { mode: AmountMode; val: string };
}

/** A line as frozen onto the bill: `amt` already resolved to minor units. */
export interface Line {
  id: string;
  name: string;
  qty: number;
  amt: number;
}

export interface Totals {
  lines: Line[];
  subtotal: number;
  gstAmt: number;
  discountAmt: number;
  tipAmt: number;
  total: number;
}

export const num = (v: string | number): number => {
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export const cents = (v: string | number): number => Math.round(num(v) * 100);

/** Formats minor units for display. Always paired with the ledger typeface. */
export function fmt(c: number, cur: string, dec = false): string {
  const v = (c || 0) / 100;
  const s = dec ? Math.abs(v).toFixed(2) : Math.round(Math.abs(v)).toString();
  const [w = "0", f] = s.split(".");
  const grouped = w.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${v < 0 ? "-" : ""}${cur} ${f ? `${grouped}.${f}` : grouped}`;
}

export function priceOf(it: DraftItem, mode: PriceMode): number {
  return mode === "each" ? cents(it.price) * Math.max(num(it.qty), 0) : cents(it.price);
}

/**
 * Bill-level maths. GST applies to the subtotal; discount and tip both apply
 * to the post-GST amount. Spec §3.1.
 */
export function compute(bill: DraftBill): Totals {
  const lines: Line[] = bill.items
    .filter((i) => i.name.trim() || num(i.price) > 0)
    .map((i) => ({
      id: i.id,
      name: i.name.trim() || "Item",
      qty: num(i.qty) || 1,
      amt: Math.round(priceOf(i, bill.priceMode)),
    }));

  const subtotal = lines.reduce((s, l) => s + l.amt, 0);
  const gstAmt = Math.round((subtotal * num(bill.gst)) / 100);
  const afterGst = subtotal + gstAmt;
  const discountAmt =
    bill.discount.mode === "pct"
      ? Math.round((afterGst * num(bill.discount.val)) / 100)
      : cents(bill.discount.val);
  const tipAmt =
    bill.tip.mode === "pct"
      ? Math.round((afterGst * num(bill.tip.val)) / 100)
      : cents(bill.tip.val);

  return { lines, subtotal, gstAmt, discountAmt, tipAmt, total: afterGst - discountAmt + tipAmt };
}
