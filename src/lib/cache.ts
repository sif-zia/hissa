/**
 * Per-viewer cache. localStorage only: a 40-line bill is a few KB, which is
 * nowhere near the quota, so IndexedDB would be machinery for nothing.
 *
 * Two jobs — remember who you are on a bill so a reload never re-asks, and
 * hold the last known state so a reload paints instantly while the fetch runs.
 */

import type { BillMeta, Person } from "./split";
import type { Identity } from "./identity";

export interface BillState {
  meta: BillMeta;
  people: Person[];
}

export interface Cached {
  etag: string;
  state: BillState;
  at: number;
}

const key = (kind: string, code: string) => `hissa:${kind}:${code.toUpperCase()}`;

/** Every accessor is guarded: private windows and blocked site data throw. */
function read<T>(k: string): T | null {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(k: string, v: unknown): void {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    // Quota or blocked storage. The app works without the cache, just slower.
  }
}

export const loadMe = (code: string): Identity | null => read<Identity>(key("me", code));
export const saveMe = (code: string, me: Identity): void => write(key("me", code), me);

/** Forget who this device is on a bill, without dropping the cached bill. */
export function forgetMe(code: string): void {
  try {
    localStorage.removeItem(key("me", code));
  } catch {
    // nothing stored to forget
  }
}

export const loadBill = (code: string): Cached | null => read<Cached>(key("bill", code));
export const saveBill = (code: string, etag: string, state: BillState): void =>
  write(key("bill", code), { etag, state, at: Date.now() } satisfies Cached);

/** Codes the viewer has been on, newest first, for the "rejoin" hint on Home. */
export function recentCodes(): string[] {
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith("hissa:bill:"))
      .map((k) => ({ code: k.slice(11), at: read<Cached>(k)?.at ?? 0 }))
      .sort((a, b) => b.at - a.at)
      .slice(0, 3)
      .map((x) => x.code);
  } catch {
    return [];
  }
}

/** Bills expire server-side after 24h; drop local copies on the same clock. */
export function sweep(): void {
  try {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith("hissa:")) continue;
      const at = read<{ at?: number }>(k)?.at;
      if (at !== undefined && at < cutoff) localStorage.removeItem(k);
    }
  } catch {
    // nothing to sweep
  }
}
