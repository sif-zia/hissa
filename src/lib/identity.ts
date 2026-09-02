/**
 * No accounts. A person is their name, normalised. Spec §4.
 *
 * `Faraz`, `faraz` and ` FARAZ ` are one person on one storage key. This makes
 * rejoining from a second device free, and makes the collision failure mode
 * (two real Farazes) visible rather than silent.
 */

const CHIPS = [
  "#A8431B", "#1F6B52", "#2E4D8F", "#8A2B5E",
  "#6C5A16", "#356B7C", "#6E3A96", "#9B3030",
];

/** Unambiguous alphabet: no I, O, 0 or 1. Spec §2.6. */
export const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const uid = (): string => Math.random().toString(36).slice(2, 9);

export const randCode = (n: number): string =>
  Array.from({ length: n }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join("");

export const nameKey = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, " ");

export const slugOf = (s: string): string =>
  nameKey(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "x";

/** Stable string hash. Drives both chip colour and tilt, so both are the same
 *  for a given person on every row and every device. */
export function hash(k: string): number {
  let h = 0;
  for (let i = 0; i < k.length; i += 1) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return h;
}

export const colorFor = (k: string): string => CHIPS[hash(k) % CHIPS.length] as string;

/**
 * Colours for everyone on one bill, with collisions resolved.
 *
 * Hashing a name straight to a colour is stable but not distinct: at a table
 * of six, two people landing on the same chip is likely enough to be a real
 * problem, and the colour is what tells you whose chip is whose at a glance.
 *
 * Each person takes their hashed colour, or the next free one if it is gone.
 * Keys are sorted first so every device assigns identically — the person whose
 * own name sorts last must not see a different palette from everyone else.
 */
export function paletteFor(keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const taken = new Set<number>();
  for (const key of [...new Set(keys)].sort()) {
    const start = hash(key) % CHIPS.length;
    let i = start;
    // Past CHIPS.length people, colours have to repeat; fall back to the hash.
    for (let n = 0; n < CHIPS.length && taken.has(i); n += 1) i = (i + 1) % CHIPS.length;
    taken.add(i);
    out[key] = CHIPS[i] as string;
  }
  return out;
}

export interface Identity {
  key: string;
  name: string;
  slug: string;
}

export const identityOf = (raw: string): Identity => {
  const name = raw.trim().replace(/\s+/g, " ").slice(0, 24);
  return { key: nameKey(name), name, slug: slugOf(name) };
};
