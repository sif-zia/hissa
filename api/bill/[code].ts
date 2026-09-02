/** GET /api/bill/:code — the whole split, or 304 if the caller is current. */

import { handler, json, codeFrom, HttpError } from "../_lib/http";
import { billKey } from "../_lib/redis";
import { loadBill, etagOf } from "../_lib/bill";

export const config = { runtime: "edge" };

export default handler(async (req) => {
  if (req.method !== "GET") throw new HttpError("Method not allowed.", 405);
  const code = codeFrom(req);
  const { state, version } = await loadBill(billKey(code));
  const etag = etagOf(version);

  // The steady-state poll: no body, no parse, no re-render on the client.
  if (req.headers.get("If-None-Match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "no-store" } });
  }
  return json(state, { headers: { ETag: etag } });
});
