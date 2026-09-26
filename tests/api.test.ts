import { describe, it, expect, afterEach, vi } from "vitest";
import { extract, fetchBill, ApiError, OFFLINE } from "../src/lib/api";

afterEach(() => { vi.unstubAllGlobals(); });

describe("no network", () => {
  // fetch() rejects only when nothing answered. That has to reach the screens
  // as "offline", not as "couldn't read that one" or "no split found".
  it("turns a rejected fetch into an offline ApiError", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    await expect(extract("x")).rejects.toMatchObject({ status: OFFLINE });
    await expect(fetchBill("KQF4")).rejects.toBeInstanceOf(ApiError);
  });

  it("keeps a server's own answer distinct from offline", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "Could not read that bill." }), { status: 502 }));
    await expect(extract("x")).rejects.toMatchObject({ status: 502, message: "Could not read that bill." });
  });
});
