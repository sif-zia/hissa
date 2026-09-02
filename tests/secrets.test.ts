import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

/**
 * The Gemini key is read only by api/extract.ts at request time. Anything the
 * client bundle can see is public, so src/ must never reference it. Spec §10.4.
 */
describe("the extraction key stays off the client", () => {
  const files = walk("src");

  it("has no API key literal anywhere in src/", () => {
    for (const f of files) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/AIza[0-9A-Za-z_-]{10,}/);
    }
  });

  it("never reads GEMINI_API_KEY from client code", () => {
    for (const f of files) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/GEMINI_API_KEY/);
    }
  });

  it("exposes no secret through a VITE_ prefixed variable", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/VITE_[A-Z_]*(KEY|SECRET|TOKEN|PASSWORD)/);
    }
  });
});
