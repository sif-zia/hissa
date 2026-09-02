/**
 * Splitting a frozen bill across claimers. Spec §3.2-3.4.
 *
 * The invariant everything rests on: every line is always fully distributed.
 * A group can never accidentally under-cover a line, whoever tapped it.
 */

import type { Line } from "./money";

/** lineId -> portions claimed. Claiming is by portion, not by unit. */
export type Claims = Record<string, number>;

export interface Person {
  key: string;
  name: string;
  claims: Claims;
}

export interface BillMeta {
  code: string;
  billName: string;
  currency: string;
  lines: Line[];
  subtotal: number;
  gstPct: number;
  gstAmt: number;
  discountAmt: number;
  tipAmt: number;
  total: number;
  splitUnclaimed: boolean;
  at: number;
}

export interface Spread {
  /** key -> their share of the subtotal, in minor units */
  subShare: Record<string, number>;
  /** subtotal-scale value of everything nobody claimed */
  loose: number;
  /** lineId -> the people on it, in claim order */
  byLine: Record<string, Person[]>;
}

/**
 * Distributes one line across its claimers by portion. The last claimer
 * absorbs the rounding remainder, which is what guarantees the cuts sum to
 * the line amount exactly.
 */
export function cutsFor(amt: number, portions: number[]): number[] {
  const units = portions.reduce((s, n) => s + n, 0);
  if (units <= 0) return portions.map(() => 0);
  const out: number[] = [];
  let done = 0;
  portions.forEach((n, i) => {
    const cut = i === portions.length - 1 ? amt - done : Math.round((amt * n) / units);
    done += cut;
    out.push(cut);
  });
  return out;
}

export function spread(meta: BillMeta, people: Person[]): Spread {
  const byLine: Record<string, Person[]> = {};
  const subShare: Record<string, number> = {};
  people.forEach((p) => {
    subShare[p.key] = 0;
  });

  let loose = 0;
  for (const line of meta.lines) {
    const on = people.filter((p) => (p.claims[line.id] ?? 0) > 0);
    byLine[line.id] = on;
    if (!on.length) {
      loose += line.amt;
      continue;
    }
    const cuts = cutsFor(line.amt, on.map((p) => p.claims[line.id] as number));
    on.forEach((p, i) => {
      subShare[p.key] = (subShare[p.key] ?? 0) + (cuts[i] as number);
    });
  }

  // Leftovers go to everyone who claimed at least one item, never to bystanders.
  const active = people.filter((p) => Object.keys(p.claims).length > 0);
  if (meta.splitUnclaimed && loose > 0 && active.length > 0) {
    const per = Math.floor(loose / active.length);
    const rem = loose - per * active.length;
    active.forEach((p, i) => {
      subShare[p.key] = (subShare[p.key] ?? 0) + per + (i < rem ? 1 : 0);
    });
    loose = 0;
  }

  return { subShare, loose, byLine };
}

/**
 * Scales a subtotal share to the final total, so tax, discount and tip ride
 * along proportionally rather than being apportioned separately. Spec §3.3.
 */
export function shareOf(meta: Pick<BillMeta, "total" | "subtotal">, subShare: number): number {
  if (!meta.subtotal) return 0;
  return Math.round((meta.total * subShare) / meta.subtotal);
}

/** Equal split. `extra` people pay one minor unit more. Spec §3.4. */
export function equalSplit(total: number, n: number): { base: number; extra: number } {
  if (n <= 0) return { base: 0, extra: 0 };
  const base = Math.floor(total / n);
  return { base, extra: total - base * n };
}
