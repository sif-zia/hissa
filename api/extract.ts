/**
 * POST /api/extract — read a bill photo. Spec §7.
 *
 * The key lives here and only here: anything the browser can see is public.
 * The photo is used for one request and never stored.
 */

import { handler, readJson, json, HttpError } from "./_lib/http";
import { cmd } from "./_lib/redis";
import { shapeReading, KINDS, type Raw } from "./_lib/reading";

export const config = { runtime: "edge" };

/**
 * Overridable without a redeploy, because models get retired: the spec's
 * gemini-2.5-flash stopped accepting new users, which is exactly the failure
 * a hardcoded name turns into a 502 for everyone.
 *
 * 3.1-flash-lite is the spec's named launch model ($0.25/$1.50 per MTok) and
 * still honours thinkingBudget:0 — the 3.6+ models reject that argument
 * outright and bill their thinking as output, which is the one way to make
 * receipt extraction unexpectedly expensive.
 */
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";
const endpointFor = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/** A 1400px JPEG at q0.75 lands around 200 KB; 1.5 MB is a generous ceiling. */
const MAX_BYTES = 1_500_000;

const PROMPT = `You are reading a photo of a restaurant or shop bill.
- "price" is the LINE TOTAL for that row (quantity x unit rate), never the unit rate.
- Copy item names as printed. Skip subtotal, tax, discount and total rows from the items list.
- "adjustments" lists each charge or reduction printed after the items, at most one of each kind:
  "gst" for sales tax, GST or VAT;
  "service" for a service charge (a service charge is never a tip);
  "discount" for any discount;
  "tip" only when a tip or gratuity is actually printed.
- For each adjustment, "pct" is its printed percentage (0 if none is printed) and "amount" is its printed money amount (0 if none).
- "step" says what the adjustment was calculated on: 1 if on the items subtotal; 2 if on the subtotal after the step-1 adjustments were applied; 3 if after step 2; and so on. Adjustments calculated on the same amount share a step.
- "printedSubtotal" is the subtotal as printed, or 0 if it is not shown.
- "printedTotal" is the final amount payable as printed, or 0 if it is not shown.
- Some bills print two taxes for two ways of paying (for example GST 16% with a "Net Amount" for cash, and GST 8% with a separate card total). Report only the tax that belongs to the main total line (Net Amount, Grand Total, Total Bill), and that total as "printedTotal". The reported tax and printedTotal must always belong together.
- "place" is the restaurant or shop name from the top of the bill, or "" if no name is visible. An address, phone number or tax number is not a name.
- "currency" is a short symbol such as Rs, $, PKR, AED.
- Numbers are plain numbers: no commas, no currency symbols.`;

/** Structured output, so there is no fenced-JSON-and-slice dance. Spec §7.2 */
const SCHEMA = {
  type: "OBJECT",
  properties: {
    currency: { type: "STRING" },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          qty: { type: "NUMBER" },
          price: { type: "NUMBER" },
        },
        required: ["name", "qty", "price"],
      },
    },
    adjustments: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          kind: { type: "STRING", format: "enum", enum: [...KINDS] },
          pct: { type: "NUMBER" },
          amount: { type: "NUMBER" },
          step: { type: "INTEGER" },
        },
        required: ["kind", "pct", "amount", "step"],
      },
    },
    printedSubtotal: { type: "NUMBER" },
    printedTotal: { type: "NUMBER" },
    place: { type: "STRING" },
  },
  required: ["currency", "items", "adjustments", "printedSubtotal", "printedTotal", "place"],
};

/** Cheap per-IP throttle. Best-effort: a Redis outage must not block reading. */
async function throttle(req: Request): Promise<void> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  try {
    const n = await cmd<number>("INCR", `rl:extract:${ip}`);
    if (n === 1) await cmd("EXPIRE", `rl:extract:${ip}`, 3600);
    if (n > 40) throw new HttpError("That is a lot of bills in an hour. Try again later.", 429);
  } catch (e) {
    if (e instanceof HttpError) throw e;
  }
}


export default handler(async (req) => {
  if (req.method !== "POST") throw new HttpError("Method not allowed.", 405);

  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new HttpError("Bill reading is not configured right now.", 503);

  const { image } = await readJson<{ image?: string }>(req);
  if (typeof image !== "string" || image.length < 100) throw new HttpError("No photo received.", 400);
  // base64 is 4 chars per 3 bytes.
  if (image.length * 0.75 > MAX_BYTES) throw new HttpError("That photo is too large.", 413);

  await throttle(req);

  const call = (withThinkingBudget: boolean) =>
    fetch(`${endpointFor(MODEL)}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: "image/jpeg", data: image } },
            { text: PROMPT },
          ],
        }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: SCHEMA,
          // Thinking tokens bill as output at several times the input rate,
          // and reading a receipt needs no reasoning budget. Spec §7.3.
          ...(withThinkingBudget ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          temperature: 0,
        },
      }),
    });

  let res = await call(true);
  // Newer models reject thinkingBudget outright rather than ignoring it. Retry
  // once without it so swapping GEMINI_MODEL forward never needs a code change.
  if (res.status === 400) res = await call(false);

  if (!res.ok) {
    console.error("gemini", MODEL, res.status, (await res.text()).slice(0, 300));
    throw new HttpError("Could not read that bill.", 502);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

  let out: Raw;
  try {
    out = JSON.parse(text) as Raw;
  } catch {
    throw new HttpError("Could not read that bill.", 502);
  }

  return json(shapeReading(out));
});
