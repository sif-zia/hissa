/**
 * From the extractor's answer to an editable bill, with the stacking settled
 * against the printed total. Pure apart from the id source, so it is tested
 * with the same fixtures the editor sees.
 */

import type { Extracted } from "./api";
import { cents, detect, noAdj, KINDS, DEFAULT_STEPS, type Adj, type DraftBill, type Kind, type Steps } from "./money";
import { loadPref, savePref } from "./cache";

export type Fit = "match" | "closest" | "unknown";

export function draftFrom(out: Extracted, id: () => string): { bill: DraftBill; fit: Fit } {
  const items = out.items.map((i) => ({
    id: id(),
    name: i.name,
    qty: String(i.qty || 1),
    price: String(i.price || 0),
  }));

  // Each extra can be read as its printed rate or its printed amount. The
  // rate is preferred, but bills round and exempt things their rates don't
  // show (15% of 2,795 printed as 418), so the amount is always a candidate.
  const adjs = (out.adjustments ?? []).filter((a) => a.pct || a.amount);
  const choices: [Kind, Adj[]][] = adjs.map((a) => [
    a.kind,
    [
      ...(a.pct ? [{ mode: "pct" as const, val: String(a.pct) }] : []),
      ...(a.amount ? [{ mode: "flat" as const, val: String(a.amount) }] : []),
    ],
  ]);
  let variants: { adj: Record<Kind, Adj>; amounts: number }[] = [{ adj: noAdj(), amounts: 0 }];
  for (const [kind, opts] of choices) {
    variants = variants.flatMap((v) =>
      opts.map((o, n) => ({ adj: { ...v.adj, [kind]: o }, amounts: v.amounts + n })));
  }
  variants.sort((a, b) => a.amounts - b.amounts);

  const byStep = new Map<number, Kind[]>();
  for (const a of adjs) byStep.set(a.step, [...(byStep.get(a.step) ?? []), a.kind]);
  const said: Steps = [...byStep.keys()].sort((a, b) => a - b).map((k) => byStep.get(k)!);

  const bill: DraftBill = {
    currency: out.currency || "Rs",
    priceMode: "total",
    items: items.length ? items : [{ id: id(), name: "", qty: "1", price: "" }],
    adj: variants[0]!.adj,
    steps: said,
    printedTotal: out.printedTotal ? cents(out.printedTotal) : undefined,
  };
  const { adj, steps, fit } = detect(bill, said, variants.map((v) => v.adj));
  return { bill: { ...bill, adj, steps }, fit };
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
