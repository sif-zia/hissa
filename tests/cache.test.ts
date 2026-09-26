import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fakeStorage } from "./storage";
import { loadName, saveName, savePref, loadPref, sweep } from "../src/lib/cache";

beforeEach(() => { vi.stubGlobal("localStorage", fakeStorage()); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("device preferences", () => {
  it("round-trips the name", () => {
    expect(loadName()).toBe("");
    saveName("Faraz");
    expect(loadName()).toBe("Faraz");
  });

  // sweep() deletes anything with an `at` older than a day. Preferences carry
  // none, so they must outlive it — or the app re-asks the name every morning.
  it("survives the 24h sweep", () => {
    saveName("Faraz");
    savePref("steps", [["gst"], ["discount", "tip"]]);
    savePref("withItems", true);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 25 * 3600_000);
    sweep();
    expect(loadName()).toBe("Faraz");
    expect(loadPref("steps")).toEqual([["gst"], ["discount", "tip"]]);
    expect(loadPref("withItems")).toBe(true);
  });

  it("still sweeps things that do carry an `at`", () => {
    savePref("round", { at: Date.now() });
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 25 * 3600_000);
    sweep();
    expect(loadPref("round")).toBeNull();
  });

  it("reads a corrupt name as no name", () => {
    localStorage.setItem("hissa:name", "{not json");
    expect(loadName()).toBe("");
  });
});

describe("landing redirect", () => {
  const html = readFileSync("index.html", "utf8");
  // The attribute-less inline script, not the JSON-LD block.
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? "";

  // cleanUrls 308s /app.html -> /app; redirecting to /app.html costs a hop.
  it("sends returning users to /app, not /app.html", () => {
    expect(script).toMatch(/location\.replace\("\/app"\)/);
    expect(script).not.toMatch(/app\.html/);
  });
  it("keys on the stored name and honours ?about", () => {
    expect(script).toMatch(/hissa:name/);
    expect(script).toMatch(/about/);
  });
  it("runs inside the try, so blocked storage still shows the page", () => {
    expect(script.indexOf("try")).toBeLessThan(script.indexOf("location.replace"));
  });
  it("is the landing page only: how-it-works never redirects", () => {
    expect(readFileSync("how-it-works.html", "utf8")).not.toMatch(/location\.replace/);
  });
});

describe("service worker navigation", () => {
  it("lets /?about through to the network instead of the app shell", () => {
    const cfg = readFileSync("vite.config.ts", "utf8");
    const m = cfg.match(/navigateFallbackDenylist: \[(\/.*?\/),/);
    expect(m).toBeTruthy();
    const re = eval(m![1]!) as RegExp;
    expect(re.test("/")).toBe(true);
    expect(re.test("/?about")).toBe(true);
    expect(re.test("/app")).toBe(false);
    expect(re.test("/s/KQF4")).toBe(false);
  });
});
