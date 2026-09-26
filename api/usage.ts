/**
 * GET /api/usage — may this device have a bill photo read right now?
 *
 * Answers from the same counts /api/extract spends, without spending. The
 * app asks as "take a pic" opens, so a device at its limit hears it before
 * taking a photo that can't be read. /api/extract checks again regardless:
 * this answer is advice, not the gate.
 */

import { handler, json, HttpError } from "./_lib/http.js";
import { deviceOf, ipOf, peek, DEVICE_LIMIT, WINDOW_S } from "./_lib/usage.js";

export const config = { runtime: "edge" };

export default handler(async (req) => {
  if (req.method !== "GET") throw new HttpError("Method not allowed.", 405);
  const { id, setCookie } = deviceOf(req);
  let usage;
  try {
    usage = await peek(id, ipOf(req));
  } catch {
    // Redis is down: say yes. /api/extract makes the same call, and reading
    // bills must not depend on the counter being up.
    usage = { allowed: true, remaining: DEVICE_LIMIT, limit: DEVICE_LIMIT, resetAt: Date.now() + WINDOW_S * 1000 };
  }
  return json(usage, setCookie ? { headers: { "Set-Cookie": setCookie } } : {});
});
