import { describe, it, expect } from "vitest";
import { nameKey, slugOf, colorFor, identityOf, randCode, ALPHA } from "../src/lib/identity";

describe("name normalisation", () => {
  it("collapses case and surrounding whitespace to one person", () => {
    // Spec §4: this is what makes rejoining from a second device free.
    const keys = ["Faraz", "faraz", " FARAZ ", "  Faraz  "].map(nameKey);
    expect(new Set(keys).size).toBe(1);
  });

  it("collapses inner whitespace too", () => {
    expect(nameKey("Ali   Raza")).toBe("ali raza");
  });

  it("lands the same person on the same storage key", () => {
    expect(slugOf(" ALI  Raza ")).toBe(slugOf("ali raza"));
  });

  it("strips punctuation out of the storage key", () => {
    expect(slugOf("M. Ali-Raza!")).toBe("m-ali-raza");
  });

  it("never produces an empty key, which would collide across people", () => {
    expect(slugOf("!!!")).toBe("x");
    expect(slugOf("")).toBe("x");
  });

  it("caps the key length", () => {
    expect(slugOf("a".repeat(100)).length).toBe(40);
  });

  it("caps the display name at 24 characters", () => {
    expect(identityOf("a".repeat(50)).name.length).toBe(24);
  });
});

describe("colour", () => {
  it("is stable for a person across every row and device", () => {
    expect(colorFor("faraz")).toBe(colorFor("faraz"));
  });
  it("keys off the normalised name, so case cannot change someone's colour", () => {
    expect(colorFor(nameKey("Faraz"))).toBe(colorFor(nameKey("FARAZ")));
  });
});

describe("codes", () => {
  it("omits the ambiguous glyphs I, O, 0 and 1", () => {
    expect(ALPHA).not.toMatch(/[IO01]/);
  });
  it("is the requested length", () => {
    expect(randCode(4)).toHaveLength(4);
  });
  it("only ever emits characters from the safe alphabet", () => {
    for (let i = 0; i < 500; i += 1) {
      expect(randCode(4).split("").every((c) => ALPHA.includes(c))).toBe(true);
    }
  });
});
