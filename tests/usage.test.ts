import { describe, it, expect, afterEach, vi } from "vitest";
import { decide, deviceOf, DEVICE_LIMIT, NETWORK_LIMIT, GLOBAL_LIMIT } from "../api/_lib/usage";
import { blockedLocally, againIn, limitMessage } from "../src/lib/usage";
import { extract, fetchUsage, LimitError } from "../src/lib/api";

const NOW = Date.UTC(2026, 8, 27, 10, 0, 0);
const H = 3_600_000;

describe("decide (server)", () => {
  it("allows up to five reads a device, counting down", () => {
    expect(decide([0, 0, 0], [-2, -2, -2], NOW)).toMatchObject({ allowed: true, remaining: 5 });
    expect(decide([4, 4, 4], [3600, 3600, 0], NOW)).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("refuses the sixth, and says when the device's window resets", () => {
    const u = decide([DEVICE_LIMIT, 5, 5], [2 * 3600, 9000, 0], NOW);
    expect(u).toMatchObject({ allowed: false, remaining: 0, reason: "device", limit: 5 });
    expect(u.resetAt).toBe(NOW + 2 * H);
  });

  it("lets a busy network through until its much higher ceiling", () => {
    expect(decide([1, NETWORK_LIMIT - 1, 40], [60, 60, 0], NOW).allowed).toBe(true);
    expect(decide([1, NETWORK_LIMIT, 40], [60, 600, 0], NOW)).toMatchObject({ allowed: false, reason: "network" });
  });

  it("stops everyone at the global cap, until midnight UTC", () => {
    const u = decide([0, 0, GLOBAL_LIMIT], [-2, -2, 50000], NOW);
    expect(u).toMatchObject({ allowed: false, reason: "global" });
    expect(u.resetAt).toBe(Date.UTC(2026, 8, 28));
  });

  it("treats a missing or never-expiring key as a fresh 24h window", () => {
    expect(decide([0, 0, 0], [-1, -1, -1], NOW).resetAt).toBe(NOW + 24 * H);
  });
});

describe("deviceOf (server)", () => {
  const req = (cookie?: string) => new Request("https://x/api/usage", { headers: cookie ? { cookie } : {} });

  it("mints an id in an HttpOnly, Secure, SameSite=Strict cookie scoped to /api", () => {
    const { id, setCookie } = deviceOf(req());
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(setCookie).toContain(`hissa_dev=${id}`);
    for (const attr of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/api"]) expect(setCookie).toContain(attr);
  });

  it("keeps a valid id and sets nothing", () => {
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
    expect(deviceOf(req(`theme=dark; hissa_dev=${id}`))).toEqual({ id });
  });

  it("replaces a forged or malformed id instead of trusting it", () => {
    for (const bad of ["hissa_dev=../../x", "hissa_dev=AAAA", "hissa_dev="]) {
      const { id, setCookie } = deviceOf(req(bad));
      expect(setCookie).toBeTruthy();
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
});

describe("the client's cached answer", () => {
  const blocked = { allowed: false, remaining: 0, limit: 5, resetAt: NOW + 5 * H, reason: "device" as const };

  it("counts as blocked only until the window resets", () => {
    expect(blockedLocally(blocked, NOW)).toBe(true);
    expect(blockedLocally(blocked, NOW + 6 * H)).toBe(false);
    expect(blockedLocally(null, NOW)).toBe(false);
    expect(blockedLocally({ ...blocked, allowed: true, remaining: 2 }, NOW)).toBe(false);
    // The fifth read's answer: it went through, and it was the last.
    expect(blockedLocally({ ...blocked, allowed: true, remaining: 0 }, NOW)).toBe(true);
  });

  it("says when photos open up again", () => {
    expect(againIn(NOW + 5 * H, NOW)).toBe("in about 5 hours");
    expect(againIn(NOW + 20 * 60_000, NOW)).toBe("in under an hour");
  });

  it("apologises, explains the cost, and names the limit", () => {
    const m = limitMessage(blocked, NOW);
    expect(m).toContain("daily limit of 5 bills");
    expect(m).toContain("sorry for the inconvenience");
    expect(m).toContain("costs us money");
    expect(m).toContain("we hope you understand");
    expect(limitMessage({ ...blocked, reason: "network" }, NOW)).toContain("this network");
    expect(limitMessage({ ...blocked, reason: "global" }, NOW)).toContain("for today");
  });
});

describe("the client's calls", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("turns a 429 with usage into a LimitError carrying it", async () => {
    const usage = { allowed: false, remaining: 0, limit: 5, resetAt: NOW, reason: "device" };
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "limit", usage }), { status: 429 }));
    const e = await extract("x").catch((x) => x);
    expect(e).toBeInstanceOf(LimitError);
    expect(e.usage).toEqual(usage);
  });

  it("reads /api/usage", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      expect(url).toBe("/api/usage");
      return new Response(JSON.stringify({ allowed: true, remaining: 3, limit: 5, resetAt: NOW }));
    });
    expect(await fetchUsage()).toMatchObject({ allowed: true, remaining: 3 });
  });
});
