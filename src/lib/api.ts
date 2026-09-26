/**
 * Talks to /api. Every read is ETag-gated so a steady-state poll costs a 304
 * with no body and no re-render. Spec §5, amended: polling replaces the
 * WebSocket, so it has to be cheap.
 */

import type { BillState } from "./cache";
import type { Claims } from "./split";
import type { Kind, Line } from "./money";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Status of an ApiError that never reached the server. */
export const OFFLINE = 0;

/** fetch() rejects only when there is no answer at all: no network. */
async function call(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new ApiError("You're offline.", OFFLINE);
  }
}

async function jsonOrThrow(res: Response): Promise<unknown> {
  if (res.ok) return res.json();
  let msg = `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) msg = body.error;
  } catch {
    // non-JSON error body
  }
  throw new ApiError(msg, res.status);
}

export interface Fresh {
  changed: true;
  etag: string;
  state: BillState;
}
export interface Unchanged {
  changed: false;
}

/** `304 Not Modified` short-circuits with no state change at all. */
export async function fetchBill(code: string, etag?: string): Promise<Fresh | Unchanged> {
  const res = await call(`/api/bill/${encodeURIComponent(code)}`, {
    headers: etag ? { "If-None-Match": etag } : {},
  });
  if (res.status === 304) return { changed: false };
  if (res.status === 404) throw new ApiError(`No split found with code ${code}.`, 404);
  const state = (await jsonOrThrow(res)) as BillState;
  return { changed: true, etag: res.headers.get("ETag") ?? "", state };
}

export interface CreateInput {
  billName: string;
  currency: string;
  lines: Line[];
  subtotal: number;
  gstPct: number;
  gstAmt: number;
  serviceAmt: number;
  discountAmt: number;
  tipAmt: number;
  total: number;
  host: { name: string; slug: string };
}

export async function createBill(input: CreateInput): Promise<BillState & { etag: string }> {
  const res = await call("/api/bill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const state = (await jsonOrThrow(res)) as BillState;
  return { ...state, etag: res.headers.get("ETag") ?? "" };
}

/** Writes only the caller's own record. Nobody can clobber anybody else. */
export async function putClaims(
  code: string,
  who: { name: string; slug: string },
  claims: Claims,
): Promise<void> {
  const res = await call(`/api/bill/${encodeURIComponent(code)}/claims`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...who, claims }),
  });
  if (!res.ok) await jsonOrThrow(res);
}

/** The one field of the frozen bill any member may change. */
export async function setSplitUnclaimed(code: string, splitUnclaimed: boolean): Promise<void> {
  const res = await call(`/api/bill/${encodeURIComponent(code)}/meta`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ splitUnclaimed }),
  });
  if (!res.ok) await jsonOrThrow(res);
}

export interface Extracted {
  currency: string;
  /** The restaurant or shop, from the header; "" when none is printed. */
  place: string;
  items: { name: string; qty: number; price: number }[];
  adjustments: { kind: Kind; pct: number; amount: number; step: number }[];
  /** Major units, 0 when no total was printed. */
  printedTotal: number;
  /** True when the extracted lines did not sum to the printed subtotal. */
  suspect?: boolean;
}

export async function extract(base64: string): Promise<Extracted> {
  const res = await call("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64 }),
  });
  return (await jsonOrThrow(res)) as Extracted;
}
