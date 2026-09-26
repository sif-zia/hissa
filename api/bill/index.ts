/** POST /api/bill — freeze a bill and open the split. */

import { handler, readJson, json, clampStr, clampInt, clampPct, safeSlug, HttpError } from "../_lib/http";
import { billKey, exists, pipeline, TTL_SECONDS } from "../_lib/redis";
import { etagOf, type StoredLine, type StoredMeta } from "../_lib/bill";

export const config = { runtime: "edge" };

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const randCode = (n: number) =>
  Array.from({ length: n }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join("");

/** Six tries at four characters, then widen rather than spin. */
async function freeCode(): Promise<string> {
  for (let i = 0; i < 6; i += 1) {
    const c = randCode(4);
    if (!(await exists(billKey(c)))) return c;
  }
  return randCode(6);
}

interface Body {
  billName?: string; currency?: string; lines?: unknown[];
  subtotal?: number; gstPct?: number; gstAmt?: number; serviceAmt?: number;
  discountAmt?: number; tipAmt?: number; total?: number;
  host?: { name?: string; slug?: string };
}

export default handler(async (req) => {
  if (req.method !== "POST") throw new HttpError("Method not allowed.", 405);
  const body = await readJson<Body>(req);

  const name = clampStr(body.host?.name, 24);
  if (!name) throw new HttpError("Put your name in first.", 400);
  const slug = safeSlug(body.host?.slug);

  const raw = Array.isArray(body.lines) ? body.lines : [];
  if (!raw.length) throw new HttpError("A bill needs at least one line.", 400);
  if (raw.length > 40) throw new HttpError("That is more lines than Hissa handles (40 max).", 400);

  const lines: StoredLine[] = raw.map((l, i) => {
    const o = l as Record<string, unknown>;
    return {
      id: clampStr(o.id, 24) || `l${i}`,
      name: clampStr(o.name, 60) || "Item",
      qty: clampInt(o.qty, 1, 999),
      // Amounts are already minor units, resolved client-side. Trust the
      // shape, not the value: recompute the subtotal from them below.
      amt: clampInt(o.amt, -100_000_000, 100_000_000),
    };
  });

  const subtotal = lines.reduce((s, l) => s + l.amt, 0);
  if (subtotal <= 0) throw new HttpError("This bill adds up to nothing.", 400);

  const code = await freeCode();
  const meta: StoredMeta = {
    code,
    // The client always names the bill (the place, or "saturday dinner");
    // this is only for a caller that didn't. Never gibberish.
    billName: clampStr(body.billName, 40) || "the bill",
    currency: clampStr(body.currency, 4) || "Rs",
    lines,
    subtotal,
    gstPct: clampPct(body.gstPct),
    serviceAmt: clampInt(body.serviceAmt, 0, 100_000_000),
    gstAmt: clampInt(body.gstAmt, 0, 100_000_000),
    discountAmt: clampInt(body.discountAmt, 0, 100_000_000),
    tipAmt: clampInt(body.tipAmt, 0, 100_000_000),
    total: clampInt(body.total, 0, 200_000_000),
    splitUnclaimed: false,
    at: Date.now(),
  };

  const key = billKey(code);
  const person = { key: name.toLowerCase(), name, claims: {} };
  await pipeline([
    ["HSET", key, "meta", JSON.stringify(meta), `c:${slug}`, JSON.stringify(person)],
    ["HSET", key, "v", "1"],
    ["EXPIRE", key, TTL_SECONDS],
  ]);

  return json({ meta, people: [person] }, { status: 201, headers: { ETag: etagOf("1") } });
});

