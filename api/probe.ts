export const config = { runtime: "edge" };
export default async function () {
  return new Response(JSON.stringify({
    gemini: Boolean(process.env.GEMINI_API_KEY),
    geminiLen: (process.env.GEMINI_API_KEY ?? "").length,
    kv: Boolean(process.env.KV_REST_API_URL),
  }), { headers: { "Content-Type": "application/json" } });
}
