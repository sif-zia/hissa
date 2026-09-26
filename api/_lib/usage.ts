/**
 * How many bill photos a device may have read: five a day.
 *
 * The count is keyed on a random device id the server mints and keeps in an
 * HttpOnly cookie, so page scripts can neither read nor forge it. Clearing
 * cookies does reset it, and nothing without accounts can stop that; the
 * per-network ceiling and the global cap are what bound the cost then. Every
 * count lives in Redis and expires 24 hours after its first read, so the
 * window resets itself.
 *
 * This is the hard limit. The app's own check is only there to say so before
 * the camera opens.
 */

import { pipeline } from "./redis.js";

export const DEVICE_LIMIT = 5;
/** Generous on purpose: one mobile carrier IP can be thousands of phones. */
export const NETWORK_LIMIT = 30;
/** Across everyone: the ceiling on a day's spend, whatever anyone does. */
export const GLOBAL_LIMIT = 500;
export const WINDOW_S = 24 * 60 * 60;

export type Reason = "device" | "network" | "global";

export interface Usage {
  allowed: boolean;
  /** Photo reads left before the tightest limit bites. */
  remaining: number;
  limit: number;
  /** When the binding limit resets, epoch ms. */
  resetAt: number;
  /** Which limit stopped this, when one did. */
  reason?: Reason;
}

const COOKIE = "hissa_dev";
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The device id from the cookie, or a new one (and the cookie to set it). */
export function deviceOf(req: Request): { id: string; setCookie?: string } {
  const m = (req.headers.get("cookie") ?? "").match(/(?:^|;\s*)hissa_dev=([^;]+)/);
  const id = m?.[1];
  if (id && ID_RE.test(id)) return { id };
  const fresh = crypto.randomUUID();
  return {
    id: fresh,
    setCookie: `${COOKIE}=${fresh}; Path=/api; Max-Age=31536000; HttpOnly; Secure; SameSite=Strict`,
  };
}

export const ipOf = (req: Request): string =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";

/* Keys carry the deployment environment, so local and preview testing never
   spends production's counts (all environments share one Redis). */
const env = () => process.env.VERCEL_ENV ?? "development";
const keys = (id: string, ip: string, now: number) => [
  `use:${env()}:d:${id}`,
  `use:${env()}:ip:${ip}`,
  // The global cap is per UTC day rather than rolling: one shared counter.
  `use:${env()}:all:${new Date(now).toISOString().slice(0, 10)}`,
] as const;

/**
 * The decision, given counts and their remaining lifetimes. Pure, so the
 * thresholds are tested without Redis. `ttls` are seconds (-2 missing, -1 no
 * expiry yet: both mean a fresh window).
 */
export function decide(counts: [number, number, number], ttls: [number, number, number], now: number): Usage {
  const limits = [DEVICE_LIMIT, NETWORK_LIMIT, GLOBAL_LIMIT] as const;
  const reasons: Reason[] = ["device", "network", "global"];
  const endOfDay = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate() + 1);
  const resetOf = (i: number) =>
    i === 2 ? endOfDay : ttls[i]! > 0 ? now + ttls[i]! * 1000 : now + WINDOW_S * 1000;

  const over = [0, 1, 2].find((i) => counts[i]! >= limits[i]!);
  const left = Math.max(0, Math.min(...[0, 1, 2].map((i) => limits[i]! - counts[i]!)));
  if (over !== undefined) {
    return { allowed: false, remaining: 0, limit: limits[over]!, resetAt: resetOf(over), reason: reasons[over] };
  }
  return { allowed: true, remaining: left, limit: DEVICE_LIMIT, resetAt: resetOf(0) };
}

/** What /api/usage answers: where this device stands, without spending. */
export async function peek(id: string, ip: string, now = Date.now()): Promise<Usage> {
  const [d, n, a] = keys(id, ip, now);
  const r = await pipeline<(string | number | null)[]>([
    ["GET", d], ["GET", n], ["GET", a], ["TTL", d], ["TTL", n],
  ]);
  const num = (v: unknown) => Number(v) || 0;
  return decide([num(r[0]), num(r[1]), num(r[2])], [num(r[3]), num(r[4]), 0], now);
}

/**
 * Spends one read, atomically: the increments and their lifetimes happen in
 * one transaction, so two quick requests can't both slip in at four. A read
 * that would go over is handed straight back.
 */
export async function take(id: string, ip: string, now = Date.now()): Promise<Usage> {
  const k = keys(id, ip, now);
  const r = await pipeline<number[]>([
    ["INCR", k[0]], ["INCR", k[1]], ["INCR", k[2]],
    ["TTL", k[0]], ["TTL", k[1]], ["TTL", k[2]],
  ]);
  const counts = [r[0]!, r[1]!, r[2]!] as [number, number, number];
  // A count's first read starts its window.
  const fresh: (string | number)[][] = [];
  if (r[3]! < 0) fresh.push(["EXPIRE", k[0], WINDOW_S]);
  if (r[4]! < 0) fresh.push(["EXPIRE", k[1], WINDOW_S]);
  if (r[5]! < 0) fresh.push(["EXPIRE", k[2], 2 * WINDOW_S]);
  if (fresh.length) await pipeline(fresh);

  // decide() asks "is there room for one more"; the counts already include this one.
  const u = decide([counts[0] - 1, counts[1] - 1, counts[2] - 1], [r[3]!, r[4]!, r[5]!], now);
  if (!u.allowed) await give(id, ip, now);
  return u.allowed ? { ...u, remaining: u.remaining - 1 } : u;
}

/** Hands a read back: it was refused, or Gemini failed and cost nothing useful. */
export async function give(id: string, ip: string, now = Date.now()): Promise<void> {
  const k = keys(id, ip, now);
  await pipeline(k.map((key) => ["DECR", key]));
}
