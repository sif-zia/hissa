import { describe, it, expect } from "vitest";
import { cutsFor, spread, shareOf, equalSplit, type BillMeta, type Person } from "../src/lib/split";
import type { Line } from "../src/lib/money";

const line = (id: string, amt: number, qty = 1): Line => ({ id, name: id, qty, amt });

const meta = (lines: Line[], over: Partial<BillMeta> = {}): BillMeta => {
  const subtotal = lines.reduce((s, l) => s + l.amt, 0);
  return {
    code: "KQF", billName: "test", currency: "Rs", lines,
    subtotal, gstPct: 0, gstAmt: 0, discountAmt: 0, tipAmt: 0,
    total: subtotal, splitUnclaimed: false, at: Date.now(), ...over,
  };
};

const person = (key: string, claims: Record<string, number>): Person =>
  ({ key, name: key, claims });

describe("cutsFor", () => {
  it("divides an evenly-divisible line exactly", () => {
    // Spec §3.2's worked example: qty 7, total 6790, seven claimers -> 970 each.
    expect(cutsFor(679000, [1, 1, 1, 1, 1, 1, 1])).toEqual(Array(7).fill(97000));
  });

  it("weights by portions, not by head", () => {
    expect(cutsFor(30000, [2, 1])).toEqual([20000, 10000]);
  });

  it("gives the last claimer the rounding remainder", () => {
    const cuts = cutsFor(1000, [1, 1, 1]);
    expect(cuts).toEqual([333, 333, 334]);
    expect(cuts.reduce((a, b) => a + b)).toBe(1000);
  });

  it("returns zeros rather than dividing by zero when nobody claimed", () => {
    expect(cutsFor(1000, [])).toEqual([]);
    expect(cutsFor(1000, [0, 0])).toEqual([0, 0]);
  });

  /**
   * The invariant the whole app rests on: a line is ALWAYS fully distributed,
   * so a group can never accidentally under-cover it. Spec §3.2.
   */
  it("always sums back to the line amount, over 5000 random configurations", () => {
    let seed = 42;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let t = 0; t < 5000; t += 1) {
      const amt = rnd(2_000_000) + 1;
      const portions = Array.from({ length: rnd(8) + 1 }, () => rnd(20) + 1);
      const cuts = cutsFor(amt, portions);
      expect(cuts.reduce((a, b) => a + b, 0)).toBe(amt);
    }
  });
});

describe("spread", () => {
  it("collects unclaimed lines as loose", () => {
    const m = meta([line("a", 10000), line("b", 5000)]);
    const s = spread(m, [person("ali", { a: 1 })]);
    expect(s.subShare["ali"]).toBe(10000);
    expect(s.loose).toBe(5000);
  });

  it("splits leftovers only among people who claimed something", () => {
    const m = meta([line("a", 10000), line("b", 5000)], { splitUnclaimed: true });
    const s = spread(m, [person("ali", { a: 1 }), person("sara", {})]);
    expect(s.subShare["ali"]).toBe(15000);
    expect(s.subShare["sara"]).toBe(0);
    expect(s.loose).toBe(0);
  });

  it("distributes an indivisible leftover without losing a paisa", () => {
    const m = meta([line("a", 10000), line("b", 1000)], { splitUnclaimed: true });
    const s = spread(m, [person("a", { a: 1 }), person("b", { a: 1 }), person("c", { a: 1 })]);
    const claimed = 10000;
    expect(s.subShare["a"]! + s.subShare["b"]! + s.subShare["c"]!).toBe(claimed + 1000);
  });

  it("leaves leftovers loose when nobody has claimed anything yet", () => {
    const m = meta([line("a", 10000)], { splitUnclaimed: true });
    const s = spread(m, [person("ali", {})]);
    expect(s.loose).toBe(10000);
  });

  it("distributes the whole subtotal once every line is claimed", () => {
    const m = meta([line("a", 3333), line("b", 6667), line("c", 10000)]);
    const s = spread(m, [person("a", { a: 1, c: 2 }), person("b", { b: 1, c: 1 })]);
    const sum = Object.values(s.subShare).reduce((x, y) => x + y, 0);
    expect(sum + s.loose).toBe(m.subtotal);
  });
});

describe("shareOf", () => {
  it("scales a subtotal share up to the final total", () => {
    // Tax and tip ride along proportionally rather than being apportioned. §3.3
    const m = { subtotal: 100000, total: 120000 };
    expect(shareOf(m, 50000)).toBe(60000);
  });

  it("returns zero on an empty bill instead of dividing by zero", () => {
    expect(shareOf({ subtotal: 0, total: 0 }, 100)).toBe(0);
  });
});

describe("equalSplit", () => {
  it("divides evenly when it can", () => {
    expect(equalSplit(120000, 4)).toEqual({ base: 30000, extra: 0 });
  });

  it("names how many people pay the extra unit rather than silently rounding", () => {
    expect(equalSplit(1000, 3)).toEqual({ base: 333, extra: 1 });
  });

  it("keeps extra strictly below the head count, and the parts summing to the total", () => {
    for (let n = 1; n <= 40; n += 1) {
      for (const total of [0, 1, 999, 100000, 123457]) {
        const { base, extra } = equalSplit(total, n);
        expect(extra).toBeGreaterThanOrEqual(0);
        expect(extra).toBeLessThan(n);
        expect(base * n + extra).toBe(total);
      }
    }
  });

  it("does not divide by zero at zero heads", () => {
    expect(equalSplit(1000, 0)).toEqual({ base: 0, extra: 0 });
  });
});
