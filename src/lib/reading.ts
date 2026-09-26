/**
 * From the extractor's answer to an editable bill, with the stacking settled
 * against the printed total. Pure apart from the id source, so it is tested
 * with the same fixtures the editor sees.
 */

import type { Extracted } from "./api";
import {
  cents, compute, detect, noAdj, KINDS, DEFAULT_STEPS, MATCH_SLACK,
  type DraftBill, type Kind, type Steps,
} from "./money";
import { loadPref, savePref } from "./cache";

export type Fit = "match" | "none" | "unknown";

export function draftFrom(out: Extracted, id: () => string): { bill: DraftBill; fit: Fit } {
  const items = out.items.map((i) => ({
    id: id(),
    name: i.name,
    qty: String(i.qty || 1),
    price: String(i.price || 0),
  }));
  const subtotal = out.items.reduce((s, i) => s + (i.price || 0), 0);

  const adj = noAdj();
  const byStep = new Map<number, Kind[]>();
  for (const a of out.adjustments ?? []) {
    let val: string;
    let mode: "pct" | "flat";
    if (a.kind === "gst") {
      // GST is a rate in this app. A bill that printed only the amount gets
      // the rate back from the subtotal, which is what GST is almost always on.
      mode = "pct";
      val = a.pct ? String(a.pct) : subtotal ? String(Math.round((a.amount / subtotal) * 10000) / 100) : "";
    } else {
      mode = a.pct ? "pct" : "flat";
      val = String(a.pct || a.amount);
    }
    if (!val || val === "0") continue;
    adj[a.kind] = { mode, val };
    byStep.set(a.step, [...(byStep.get(a.step) ?? []), a.kind]);
  }
  const said: Steps = [...byStep.keys()].sort((a, b) => a - b).map((k) => byStep.get(k)!);

  const bill: DraftBill = {
    currency: out.currency || "Rs",
    priceMode: "total",
    items: items.length ? items : [{ id: id(), name: "", qty: "1", price: "" }],
    adj,
    steps: said,
    printedTotal: out.printedTotal ? cents(out.printedTotal) : undefined,
  };
  const { steps, fit } = detect(bill, said);
  if (fit !== "none") return { bill: { ...bill, steps }, fit };

  // No stacking of the printed rates reaches the printed total. Bills round
  // and exempt things their rates don't show (15% of 2,795 printed as 418),
  // so try what was actually charged: the printed amounts, GST as the rate
  // those amounts imply on the subtotal.
  const asCharged = byAmount(bill, out, subtotal);
  if (asCharged) return { bill: asCharged, fit: "match" };
  return { bill: { ...bill, steps }, fit };
}

function byAmount(bill: DraftBill, out: Extracted, subtotal: number): DraftBill | null {
  const adjs = out.adjustments ?? [];
  if (!adjs.length || !subtotal || adjs.some((a) => !a.amount)) return null;
  const adj = noAdj();
  for (const a of adjs) {
    adj[a.kind] = a.kind === "gst"
      ? { mode: "pct", val: String(Math.round((a.amount / subtotal) * 10000) / 100) }
      : { mode: "flat", val: String(a.amount) };
  }
  // One step: every flat amount ignores its base, and GST is on the subtotal.
  const alt: DraftBill = { ...bill, adj, steps: [adjs.map((a) => a.kind)] };
  const { total } = compute(alt);
  return bill.printedTotal && Math.abs(total - bill.printedTotal) <= MATCH_SLACK ? alt : null;
}

/** The stacking of the last bill that was split, for the next manual one. */
export function rememberedSteps(): Steps {
  const s = loadPref<unknown>("steps");
  const ok =
    Array.isArray(s) &&
    s.length > 0 &&
    s.every((g) => Array.isArray(g) && g.every((k) => (KINDS as readonly string[]).includes(k)));
  return ok ? (s as Steps) : DEFAULT_STEPS;
}

export const rememberSteps = (steps: Steps): void => {
  if (steps.length) savePref("steps", steps);
};
