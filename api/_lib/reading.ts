/**
 * Turns the model's raw JSON into what the client gets. Pure, so the
 * clamping — the only thing standing between a confused model and the
 * editor — is unit-tested without calling Gemini.
 */

import { clampStr, clampPct } from "./http.js";

export const KINDS = ["service", "gst", "discount", "tip"] as const;
export type Kind = (typeof KINDS)[number];

export interface Adjustment { kind: Kind; pct: number; amount: number; step: number }
interface Item { name: string; qty: number; price: number }

export interface Raw {
  currency?: unknown; place?: unknown; items?: unknown;
  adjustments?: unknown; printedSubtotal?: unknown; printedTotal?: unknown;
}

/** Bills print discounts as "-348"; the sign is the kind's job, not the amount's. */
const money = (v: unknown): number => {
  const n = Math.abs(Number(v));
  return Number.isFinite(n) ? n : 0;
};

export function shapeReading(out: Raw) {
  const items: Item[] = (Array.isArray(out.items) ? out.items : [])
    .slice(0, 40)
    .map((raw) => {
      const i = (raw ?? {}) as Record<string, unknown>;
      const qty = Number(i.qty);
      const price = Number(i.price);
      return {
        name: String(i.name ?? "").slice(0, 60),
        qty: Number.isFinite(qty) ? Math.max(1, Math.round(qty)) : 1,
        price: Number.isFinite(price) ? price : 0,
      };
    })
    .filter((i) => i.name || i.price);

  // One of each kind, first reading wins; a row with neither a rate nor an
  // amount carries no information.
  const seen = new Set<Kind>();
  const adjustments: Adjustment[] = [];
  for (const raw of Array.isArray(out.adjustments) ? out.adjustments : []) {
    const a = (raw ?? {}) as Record<string, unknown>;
    const kind = a.kind as Kind;
    if (!KINDS.includes(kind) || seen.has(kind)) continue;
    const pct = clampPct(a.pct);
    const amount = money(a.amount);
    if (!pct && !amount) continue;
    seen.add(kind);
    const step = Math.round(Number(a.step));
    adjustments.push({ kind, pct, amount, step: Number.isFinite(step) ? Math.min(4, Math.max(1, step)) : 1 });
  }

  // Arithmetic check: one comparison that catches most misreads, and tells the
  // review screen when to be loud about it. Spec §7.4.
  const summed = items.reduce((s, i) => s + i.price, 0);
  const printed = money(out.printedSubtotal);
  const suspect = printed > 0 && Math.abs(summed - printed) > Math.max(1, printed * 0.02);

  const find = (k: Kind) => adjustments.find((a) => a.kind === k);
  return {
    currency: clampStr(out.currency, 4) || "Rs",
    place: clampStr(out.place, 40),
    items,
    adjustments,
    printedTotal: money(out.printedTotal),
    suspect,
    // TODO(v2+1w): drop these. They keep an installed v1 app — which the
    // autoUpdate service worker can leave running for a while after a deploy —
    // reading bills. v1 knew no service charge, so it rides in as tip.
    gstPct: find("gst")?.pct ?? 0,
    discount: find("discount")?.amount ?? 0,
    tip: (find("tip")?.amount ?? 0) + (find("service")?.amount ?? 0),
  };
}
