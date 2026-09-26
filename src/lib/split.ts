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
  /** v2; absent on bills opened before it. */
  serviceAmt?: number;
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
  /** lineId -> key -> that person's cut of the line, minor units */
  cuts: Record<string, Record<string, number>>;
  /** key -> their slice of the shared leftovers, subtotal-scale */
  leftover: Record<string, number>;
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
  const cuts: Record<string, Record<string, number>> = {};
  const leftover: Record<string, number> = {};
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
    const cut = cutsFor(line.amt, on.map((p) => p.claims[line.id] as number));
    cuts[line.id] = {};
    on.forEach((p, i) => {
      cuts[line.id]![p.key] = cut[i] as number;
      subShare[p.key] = (subShare[p.key] ?? 0) + (cut[i] as number);
    });
  }

  // Leftovers go to everyone who claimed at least one item, never to bystanders.
  const active = people.filter((p) => Object.keys(p.claims).length > 0);
  if (meta.splitUnclaimed && loose > 0 && active.length > 0) {
    const per = Math.floor(loose / active.length);
    const rem = loose - per * active.length;
    active.forEach((p, i) => {
      leftover[p.key] = per + (i < rem ? 1 : 0);
      subShare[p.key] = (subShare[p.key] ?? 0) + leftover[p.key]!;
    });
    loose = 0;
  }

  return { subShare, loose, byLine, cuts, leftover };
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

/** Tap a line: claim one portion, or let go of it entirely. */
export function toggleClaim(claims: Claims, lineId: string): Claims {
  const next = { ...claims };
  if (next[lineId]) delete next[lineId];
  else next[lineId] = 1;
  return next;
}

/** The ×N stepper. Zero portions is no claim; 20 is the ceiling. */
export function bumpClaim(claims: Claims, lineId: string, delta: number): Claims {
  const next = { ...claims };
  const v = (next[lineId] ?? 0) + delta;
  if (v <= 0) delete next[lineId];
  else next[lineId] = Math.min(v, 20);
  return next;
}
