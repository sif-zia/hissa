import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const pages = { "/": "index.html", "/how-it-works": "how-it-works.html" } as const;
const SITE = "https://hissa.itisamzia.dev";

describe("the SEO surface", () => {
  for (const [path, file] of Object.entries(pages)) {
    const html = readFileSync(file, "utf8");
    it(`${path}: structured data parses`, () => {
      const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
      expect(blocks.length).toBeGreaterThan(0);
      for (const [, json] of blocks) expect(() => JSON.parse(json!)).not.toThrow();
    });
    it(`${path}: canonical, and listed in the sitemap under that URL`, () => {
      const canonical = html.match(/rel="canonical" href="([^"]*)"/)?.[1];
      expect(canonical).toBe(`${SITE}${path === "/" ? "/" : path}`);
      expect(readFileSync("public/sitemap.xml", "utf8")).toContain(`<loc>${canonical}</loc>`);
      expect(readFileSync("public/llms.txt", "utf8")).toContain(`(${canonical})`);
    });
  }

  // Google wants FAQ markup to describe what is visibly on the page.
  it("how-it-works: every FAQ topic added in v2 is also in the visible copy", () => {
    const html = readFileSync("how-it-works.html", "utf8").toLowerCase();
    const visible = html.replace(/<script[\s\S]*?<\/script>/g, "");
    for (const phrase of ["pass the phone", "offline", "service charge", "closest"]) {
      expect(visible).toContain(phrase);
    }
  });

  it("keeps people's bills and the app out of the index", () => {
    const robots = readFileSync("public/robots.txt", "utf8");
    for (const p of ["/s/", "/api/"]) expect(robots).toContain(`Disallow: ${p}`);
    expect(readFileSync("app.html", "utf8")).toMatch(/name="robots" content="noindex/);
  });
});
