/**
 * Pass the phone: one device, everyone's turn in order. Entirely local — no
 * code, no server — built from the same BillMeta and Person shapes as a live
 * split so spread() and shareOf() do all the maths.
 */

import type { BillMeta, Person } from "./split";
import { identityOf, nameKey } from "./identity";
import { loadPref, savePref } from "./cache";

export interface Round {
  meta: BillMeta;
  people: Person[];
  /** Whose turn, or the tally. */
  turn: number | "tally";
  /** Fixing one turn from the tally: no handoff card, and back to the tally. */
  redo: boolean;
  /** Creation time. Present on purpose: sweep() clears a round after a day. */
  at: number;
}

export function loadRound(): Round | null {
  const r = loadPref<Round>("round");
  return r && r.meta && Array.isArray(r.people) && r.people.length ? r : null;
}

export const saveRound = (r: Round): void => savePref("round", r);

/**
 * Indices of names that collide once normalised. Identity is the normalised
 * name here too, so "Sara" and "sara " would silently merge into one person.
 */
export function dupes(names: string[]): Set<number> {
  const seen = new Map<string, number[]>();
  names.forEach((n, i) => {
    const k = nameKey(n);
    if (k) seen.set(k, [...(seen.get(k) ?? []), i]);
  });
  return new Set([...seen.values()].filter((v) => v.length > 1).flat());
}

/**
 * The people for a round from the names typed, carrying claims across by
 * position: going back to the table to fix a spelling keeps what was tapped,
 * and removing the last person drops only theirs.
 */
export function seat(names: string[], before: Person[] = []): Person[] {
  return names.map((n, i) => {
    const who = identityOf(n);
    return { key: who.key, name: who.name, claims: before[i]?.claims ?? {} };
  });
}
