import { describe, it, expect } from "vitest";
import { nameKey, slugOf, colorFor, paletteFor, identityOf, randCode, ALPHA } from "../src/lib/identity";

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

describe("palette", () => {
  it("gives everyone on a bill a distinct colour", () => {
    // The real collision that prompted this: faraz and bilal hash to the same
    // chip, and two people sharing a colour at a table is unreadable.
    const p = paletteFor(["faraz", "bilal", "sara"]);
    expect(new Set(Object.values(p)).size).toBe(3);
  });

  it("is identical whatever order the caller lists people in", () => {
    // Every device puts itself first, so assignment must not depend on order.
    const a = paletteFor(["faraz", "bilal", "sara"]);
    const b = paletteFor(["sara", "faraz", "bilal"]);
    const c = paletteFor(["bilal", "sara", "faraz"]);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it("keeps colours distinct for any group up to the palette size", () => {
    const names = ["ali","bilal","faraz","sara","zainab","omar","hina","kamran"];
    for (let n = 1; n <= names.length; n += 1) {
      const p = paletteFor(names.slice(0, n));
      expect(new Set(Object.values(p)).size, `${n} people`).toBe(n);
    }
  });

  it("still assigns a colour to everyone past the palette size", () => {
    const many = Array.from({ length: 20 }, (_, i) => `person${i}`);
    const p = paletteFor(many);
    expect(Object.keys(p)).toHaveLength(20);
    expect(Object.values(p).every(Boolean)).toBe(true);
  });

  it("ignores duplicate keys", () => {
    expect(Object.keys(paletteFor(["faraz", "faraz"]))).toEqual(["faraz"]);
  });

  it("leaves a lone person on their own hashed colour", () => {
    expect(paletteFor(["faraz"])["faraz"]).toBe(colorFor("faraz"));
  });
});
