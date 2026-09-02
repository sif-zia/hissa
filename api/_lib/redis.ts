/**
 * Upstash Redis over its REST API — no client library, just fetch. The whole
 * surface this app needs is HGETALL, a pipelined write, and EXISTS.
 *
 * One hash per bill:
 *   bill:<CODE>   v -> version counter, doubles as the ETag
 *                 meta -> frozen bill JSON
 *                 c:<slug> -> one field per person, written only by them
 */

const URL_ = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

/** Bills die after a day. Also fixes the spec's "codes never expire" limit. */
export const TTL_SECONDS = 24 * 60 * 60;

export const billKey = (code: string) => `bill:${code.toUpperCase()}`;

function requireConfig(): { url: string; token: string } {
  if (!URL_ || !TOKEN) {
    throw new Error("Redis is not configured: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN");
  }
  return { url: URL_, token: TOKEN };
}

async function send(body: unknown): Promise<unknown> {
  const { url, token } = requireConfig();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** One command. */
export async function cmd<T = unknown>(...args: (string | number)[]): Promise<T> {
  const out = (await send(args.map(String))) as { result: T; error?: string };
  if (out.error) throw new Error(`Redis: ${out.error}`);
  return out.result;
}

/**
 * A pipeline. Writes always bundle HSET + HINCRBY v + EXPIRE so the version
 * can never drift out of step with the data it describes.
 */
export async function pipeline<T = unknown[]>(cmds: (string | number)[][]): Promise<T> {
  const out = (await send(cmds.map((c) => c.map(String)))) as { result: unknown; error?: string }[];
  const bad = out.find((r) => r.error);
  if (bad) throw new Error(`Redis: ${bad.error}`);
  return out.map((r) => r.result) as T;
}

export const hgetall = async (key: string): Promise<Record<string, string>> => {
  const flat = await cmd<string[] | null>("HGETALL", key);
  if (!flat || flat.length === 0) return {};
  const out: Record<string, string> = {};
  for (let i = 0; i < flat.length; i += 2) out[flat[i] as string] = flat[i + 1] as string;
  return out;
};

export const exists = async (key: string): Promise<boolean> =>
  (await cmd<number>("EXISTS", key)) === 1;

/** Sets one hash field, bumps the version, and refreshes the TTL, atomically. */
export async function writeField(key: string, field: string, value: string): Promise<number> {
  const [, v] = await pipeline<[unknown, number, unknown]>([
    ["HSET", key, field, value],
    ["HINCRBY", key, "v", 1],
    ["EXPIRE", key, TTL_SECONDS],
  ]);
  return v;
}
