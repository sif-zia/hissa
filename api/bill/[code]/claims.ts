/**
 * POST /api/bill/:code/claims — write the caller's own claims and nothing else.
 *
 * One field per person is the entire concurrency design: eight people tapping
 * while the bill is read out at the table cannot clobber each other, because
 * no two of them ever write the same field. Spec §5.
 */

import { handler, readJson, json, codeFrom, clampStr, clampInt, safeSlug, HttpError } from "../../_lib/http";
import { billKey, exists, writeField } from "../../_lib/redis";
import { etagOf } from "../../_lib/bill";

export const config = { runtime: "edge" };

interface Body { name?: string; slug?: string; claims?: Record<string, unknown> }

export default handler(async (req) => {
  if (req.method !== "POST") throw new HttpError("Method not allowed.", 405);
  const code = codeFrom(req);
  const key = billKey(code);
  if (!(await exists(key))) throw new HttpError("No split found with that code.", 404);

  const body = await readJson<Body>(req);
  const name = clampStr(body.name, 24);
  if (!name) throw new HttpError("Missing name.", 400);
  const slug = safeSlug(body.slug);

  const claims: Record<string, number> = {};
  for (const [lineId, portions] of Object.entries(body.claims ?? {})) {
    const id = clampStr(lineId, 24);
    const n = clampInt(portions, 0, 20);
    // Zero means "untapped": drop it rather than storing a claim of nothing.
    if (id && n > 0) claims[id] = n;
  }
  if (Object.keys(claims).length > 40) throw new HttpError("Too many claims.", 400);

  const v = await writeField(key, `c:${slug}`, JSON.stringify({ key: name.toLowerCase(), name, claims }));
  return json({ ok: true }, { headers: { ETag: etagOf(String(v)) } });
});
