/** Shared request plumbing for the Vercel functions. */

export const json = (data: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      // Bill state is per-code and changes constantly; the ETag does the
      // caching, a shared CDN cache would serve one group another's bill.
      "Cache-Control": "no-store",
      ...init.headers,
    },
  });

export const fail = (message: string, status = 400): Response => json({ error: message }, { status });

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError("Malformed request body.", 400);
  }
}

export class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Wraps a handler so thrown HttpErrors become responses and nothing leaks. */
export const handler =
  (fn: (req: Request) => Promise<Response>) =>
  async (req: Request): Promise<Response> => {
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return fail(e.message, e.status);
      console.error(e);
      return fail("Something went wrong on our side.", 500);
    }
  };

/** Bill codes are 4-8 characters from the unambiguous alphabet. */
const CODE_RE = /^[A-HJ-NP-Z2-9]{4,8}$/;

export function codeFrom(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const i = parts.indexOf("bill");
  const code = (parts[i + 1] ?? "").toUpperCase();
  if (!CODE_RE.test(code)) throw new HttpError("That is not a valid bill code.", 400);
  return code;
}

export const clampStr = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "";

export const clampInt = (v: unknown, lo: number, hi: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(n)));
};

/** Storage keys must survive being pasted into a Redis field name. */
export const safeSlug = (v: unknown): string => {
  const s = String(v ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
  if (!s) throw new HttpError("Missing or invalid name.", 400);
  return s;
};
