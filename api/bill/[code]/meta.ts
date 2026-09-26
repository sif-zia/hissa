/**
 * PATCH /api/bill/:code/meta — the leftovers toggle, and only that.
 *
 * The bill is frozen when the split opens (spec §2.7, §5), so this endpoint
 * deliberately cannot touch lines, totals or tax. It reads the stored meta and
 * writes back exactly one changed boolean.
 */

import { handler, readJson, json, codeFrom, HttpError } from "../../_lib/http.js";
import { billKey, writeField } from "../../_lib/redis.js";
import { loadBill, etagOf } from "../../_lib/bill.js";

export const config = { runtime: "edge" };

export default handler(async (req) => {
  if (req.method !== "PATCH") throw new HttpError("Method not allowed.", 405);
  const code = codeFrom(req);
  const key = billKey(code);

  const { splitUnclaimed } = await readJson<{ splitUnclaimed?: unknown }>(req);
  if (typeof splitUnclaimed !== "boolean") throw new HttpError("splitUnclaimed must be true or false.", 400);

  const { state } = await loadBill(key);
  const v = await writeField(key, "meta", JSON.stringify({ ...state.meta, splitUnclaimed }));
  return json({ ok: true, splitUnclaimed }, { headers: { ETag: etagOf(String(v)) } });
});
