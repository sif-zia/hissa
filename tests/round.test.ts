import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { dupes, seat, loadRound, saveRound, type Round } from "../src/lib/round";
import { spread, shareOf, toggleClaim, bumpClaim, type BillMeta } from "../src/lib/split";
import { fakeStorage } from "./storage";

describe("dupes", () => {
  it("catches names that normalise the same", () => {
    expect([...dupes(["Sara", "ali", "sara "])]).toEqual([0, 2]);
    expect([...dupes(["Ali  Raza", "ali raza", "ALI RAZA"])].sort()).toEqual([0, 1, 2]);
  });
  it("ignores blanks, which are caught as 'required' instead", () => {
    expect(dupes(["", " ", "sara"]).size).toBe(0);
  });
});

describe("seat", () => {
  it("keeps claims by position and drops a removed person's", () => {
    const before = seat(["faraz", "sara", "ali"]);
    before[1]!.claims = { a: 1 };
    before[2]!.claims = { b: 2 };
    const after = seat(["faraz", "Sarah"], before);
    expect(after.map((p) => p.key)).toEqual(["faraz", "sarah"]);
    expect(after[1]!.claims).toEqual({ a: 1 });
  });
});

describe("claims", () => {
  it("toggles a portion on and off", () => {
    expect(toggleClaim({}, "a")).toEqual({ a: 1 });
    expect(toggleClaim({ a: 3 }, "a")).toEqual({});
  });
  it("steps portions between 0 and 20", () => {
    expect(bumpClaim({ a: 1 }, "a", -1)).toEqual({});
    expect(bumpClaim({ a: 20 }, "a", 1)).toEqual({ a: 20 });
  });
});

describe("the tally", () => {
  const meta = (splitUnclaimed = false): BillMeta => ({
    code: "", billName: "kolachi", currency: "Rs",
    lines: [
      { id: "k", name: "karahi", qty: 1, amt: 180000 },
      { id: "n", name: "naan", qty: 4, amt: 40000 },
      { id: "c", name: "chai", qty: 3, amt: 45000 },
    ],
    subtotal: 265000, gstPct: 16, gstAmt: 42400, serviceAmt: 0, discountAmt: 0, tipAmt: 0,
    total: 307400, splitUnclaimed, at: 0,
  });

  it("adds up to the bill, within a paisa per person, when everything is claimed", () => {
    const people = seat(["faraz", "sara", "ali"]);
    people[0]!.claims = { k: 1, n: 1 };
    people[1]!.claims = { k: 1, c: 1 };
    people[2]!.claims = { k: 2, n: 1, c: 2 };
    const m = meta();
    const { subShare, loose } = spread(m, people);
    expect(loose).toBe(0);
    const sum = people.reduce((s, p) => s + shareOf(m, subShare[p.key] ?? 0), 0);
    expect(Math.abs(sum - m.total)).toBeLessThanOrEqual(people.length);
  });

  it("charges someone who claimed nothing nothing, even with leftovers shared", () => {
    const people = seat(["faraz", "sara"]);
    people[0]!.claims = { k: 1 };
    const { subShare, loose } = spread(meta(true), people);
    expect(loose).toBe(0);
    expect(subShare["sara"]).toBe(0);
  });
});

describe("round storage", () => {
  beforeEach(() => { vi.stubGlobal("localStorage", fakeStorage()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("round-trips", () => {
    const r = { meta: { billName: "x" }, people: seat(["a"]), turn: 0, redo: false, at: 1 } as unknown as Round;
    saveRound(r);
    expect(loadRound()?.people[0]!.name).toBe("a");
  });
  it("reads corrupt or empty storage as no round", () => {
    localStorage.setItem("hissa:round", "{bad");
    expect(loadRound()).toBeNull();
    localStorage.setItem("hissa:round", JSON.stringify({ meta: {}, people: [] }));
    expect(loadRound()).toBeNull();
  });
});
