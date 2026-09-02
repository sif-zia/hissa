import { describe, it, expect } from "vitest";
import { clampStr, clampInt, safeSlug, codeFrom, HttpError } from "../api/_lib/http";

const req = (path: string) => new Request(`https://hissa.itisamzia.dev${path}`);

describe("clampStr", () => {
  it("trims and collapses whitespace", () => expect(clampStr("  a   b  ", 20)).toBe("a b"));
  it("truncates to the cap", () => expect(clampStr("x".repeat(99), 24)).toHaveLength(24));
  it("rejects non-strings rather than coercing them", () => {
    expect(clampStr(42, 10)).toBe("");
    expect(clampStr(null, 10)).toBe("");
    expect(clampStr({ toString: () => "evil" }, 10)).toBe("");
  });
});

describe("clampInt", () => {
  it("holds the range", () => {
    expect(clampInt(999, 1, 20)).toBe(20);
    expect(clampInt(-5, 1, 20)).toBe(1);
  });
  it("falls back to the floor on junk rather than emitting NaN", () => {
    expect(clampInt("abc", 0, 10)).toBe(0);
    expect(clampInt(undefined, 0, 10)).toBe(0);
    expect(clampInt(Infinity, 0, 10)).toBe(0);
    expect(clampInt(NaN, 3, 10)).toBe(3);
  });
  it("rounds instead of truncating", () => expect(clampInt(2.6, 0, 10)).toBe(3));
});

describe("safeSlug", () => {
  it("strips anything that is not a storage-safe character", () => {
    expect(safeSlug("Ali Raza!")).toBe("aliraza");
    expect(safeSlug("ali-raza")).toBe("ali-raza");
  });
  it("refuses an empty result rather than colliding everyone onto one key", () => {
    expect(() => safeSlug("!!!")).toThrow(HttpError);
    expect(() => safeSlug("")).toThrow(HttpError);
    expect(() => safeSlug(null)).toThrow(HttpError);
  });
  it("cannot be used to escape into another hash field", () => {
    // A slug becomes a Redis field name "c:<slug>" — no colons may survive.
    expect(safeSlug("a:meta")).toBe("ameta");
    expect(safeSlug("../../meta")).toBe("meta");
  });
});

describe("codeFrom", () => {
  it("reads and upper-cases the code from the path", () => {
    expect(codeFrom(req("/api/bill/kqf4"))).toBe("KQF4");
    expect(codeFrom(req("/api/bill/KQF4/claims"))).toBe("KQF4");
  });
  it("rejects codes containing the ambiguous glyphs", () => {
    for (const bad of ["KQI4", "KQO4", "KQ04", "KQ14"]) {
      expect(() => codeFrom(req(`/api/bill/${bad}`))).toThrow(HttpError);
    }
  });
  it("rejects the wrong length and outright junk", () => {
    for (const bad of ["ABC", "ABCDEFGHJ", "AB%24", ""]) {
      expect(() => codeFrom(req(`/api/bill/${bad}`))).toThrow(HttpError);
    }
  });
});
