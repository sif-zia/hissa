/** Shape of what is stored, and how it is read back out of the hash. */

import { hgetall } from "./redis";
import { HttpError } from "./http";

export interface StoredLine { id: string; name: string; qty: number; amt: number }

export interface StoredMeta {
  code: string;
  billName: string;
  currency: string;
  lines: StoredLine[];
  subtotal: number;
  gstPct: number;
  gstAmt: number;
  discountAmt: number;
  tipAmt: number;
  total: number;
  splitUnclaimed: boolean;
  at: number;
}

export interface StoredPerson { key: string; name: string; claims: Record<string, number> }

export interface BillState { meta: StoredMeta; people: StoredPerson[] }

export interface Loaded { state: BillState; version: string }

export async function loadBill(key: string): Promise<Loaded> {
  const hash = await hgetall(key);
  if (!hash.meta) throw new HttpError("No split found with that code.", 404);

  const meta = JSON.parse(hash.meta) as StoredMeta;
  const people: StoredPerson[] = [];
  for (const [field, raw] of Object.entries(hash)) {
    if (!field.startsWith("c:")) continue;
    try {
      const p = JSON.parse(raw) as StoredPerson;
      if (p?.name) people.push({ key: p.key, name: p.name, claims: p.claims ?? {} });
    } catch {
      // A single unreadable record must not take the whole split down.
    }
  }
  // Stable order, so the leftover remainder lands on the same person for
  // everyone and two devices never disagree about who pays the extra paisa.
  people.sort((a, b) => a.key.localeCompare(b.key));

  return { state: { meta, people }, version: hash.v ?? "0" };
}

export const etagOf = (version: string): string => `"${version}"`;
