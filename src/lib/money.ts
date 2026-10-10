/**
 * Money is integer minor units (paisa/cents) everywhere. Floats appear only
 * here, at parse time. Spec §3.
 */

export type PriceMode = "total" | "each";
export type AmountMode = "flat" | "pct";

export interface DraftItem {
  id: string;
  name: string;
  qty: string;
  price: string;
}

/**
 * The extras a bill can carry. Discount subtracts; `diff` is signed. `diff` is
 * never printed on a bill: it is the balancing row added when no reading of
 * the printed extras reaches the printed total, and it always stacks last,
 * alone, so it never moves another row's base.
 */
export type Kind = "service" | "gst" | "discount" | "tip" | "diff";
export const KINDS: readonly Kind[] = ["service", "gst", "discount", "tip", "diff"];

/**
 * How the extras stack: ordered groups ("steps"). Every % in step 1 is of the
 * subtotal; every % in step 2 is of the running total after step 1; and so on.
 * Rows sharing a step share a base. `[["gst"], ["discount", "tip"]]` is the
 * v1 rule.
 */
export type Steps = Kind[][];

/**
 * Stackings in the order Pakistani bills use them, from 27 photographed
 * receipts (Google Images, "cafe lahore long bill receipt", 2026-10-10;
 * transcribed in tests/pk-bills.test.ts). Every one with extras put them all
 * on the subtotal, bar two that printed GST already inside the total and
 * Freddy's, which adds up by no reading. Service before GST on the
 * service-inclusive amount showed up only weakly (one bill's rates, one
 * cropped "total before tax"), and v1's rule stays last for old habits. A tie
 * between stackings that both reach the printed total goes to the earlier one.
 */
export const PRESETS: readonly Steps[] = [
  [["service", "gst", "discount", "tip"]],
  [["service"], ["gst", "discount", "tip"]],
  [["service", "gst"], ["discount", "tip"]],
];
export const DEFAULT_STEPS: Steps = PRESETS[0]!;
/** v1's rule: GST on the subtotal, discount and tip on the post-GST amount. */
export const V1_STEPS: Steps = [["service", "gst"], ["discount", "tip"]];

export interface Adj { mode: AmountMode; val: string }

export interface DraftBill {
  currency: string;
  priceMode: PriceMode;
  items: DraftItem[];
  adj: Record<Kind, Adj>;
  steps: Steps;
  /** The total printed on the photographed bill, minor units, if one was read. */
  printedTotal?: number;
  /** billSig() of the bill when a `diff` row was added to balance it. */
  balanced?: string;
}

export const noAdj = (): Record<Kind, Adj> => ({
  service: { mode: "pct", val: "" },
  gst: { mode: "pct", val: "" },
  discount: { mode: "flat", val: "" },
  tip: { mode: "flat", val: "" },
  diff: { mode: "flat", val: "" },
});

/** A line as frozen onto the bill: `amt` already resolved to minor units. */
export interface Line {
  id: string;
  name: string;
  qty: number;
  amt: number;
}

export interface Totals {
  lines: Line[];
  subtotal: number;
  /** Resolved amount of each extra, always positive (discount is subtracted). */
  amts: Record<Kind, number>;
  /** What each extra's percentage was taken of. */
  bases: Record<Kind, number>;
  /** The active extras as they were actually stacked. */
  steps: Steps;
  serviceAmt: number;
  gstAmt: number;
  discountAmt: number;
  tipAmt: number;
  /** Signed. */
  diffAmt: number;
  total: number;
  /** A discount bigger than the bill; the total was held at zero. */
  clamped: boolean;
}

export const num = (v: string | number): number => {
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export const cents = (v: string | number): number => Math.round(num(v) * 100);

/** Formats minor units for display. Always paired with the ledger typeface. */
export function fmt(c: number, cur: string, dec = false): string {
  const v = (c || 0) / 100;
  const s = dec ? Math.abs(v).toFixed(2) : Math.round(Math.abs(v)).toString();
  const [w = "0", f] = s.split(".");
  const grouped = w.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${v < 0 ? "-" : ""}${cur} ${f ? `${grouped}.${f}` : grouped}`;
}

export function priceOf(it: DraftItem, mode: PriceMode): number {
  return mode === "each" ? cents(it.price) * Math.max(num(it.qty), 0) : cents(it.price);
}

/** Extras with something in them. Empty rows take no part in the stacking. */
export const active = (adj: Record<Kind, Adj>): Kind[] =>
  KINDS.filter((k) => (k === "diff" ? num(adj[k].val) !== 0 : num(adj[k].val) > 0));

/** Everything that changes the bill's numbers, as one comparable string. */
export const billSig = (b: DraftBill): string =>
  JSON.stringify([b.priceMode, b.items.map((i) => [i.name, i.qty, i.price]), b.adj, b.steps]);

const modeOf = (k: Kind, adj: Record<Kind, Adj>): AmountMode => adj[k].mode;

/**
 * Steps restricted to the active extras, empty steps closed up. An extra the
 * steps don't mention goes where v1 put it: charges on the food (service,
 * gst) into the first step, discount and tip into the last.
 */
export function normalise(steps: Steps, act: readonly Kind[]): Steps {
  const on = new Set(act);
  const out = steps.map((g) => g.filter((k) => on.has(k) && k !== "diff")).filter((g) => g.length > 0);
  const seen = new Set(out.flat());
  for (const k of KINDS) {
    if (!on.has(k) || seen.has(k) || k === "diff") continue;
    if (!out.length) out.push([]);
    const g = k === "service" || k === "gst" ? out[0] : out[out.length - 1];
    g!.push(k);
    seen.add(k);
  }
  // Canonical order inside a step: rows in one step commute.
  return withDiff(out.map((g) => KINDS.filter((k) => g.includes(k))), act);
}

/** The balancing row, when there is one, as its own last step. */
const withDiff = (steps: Steps, act: readonly Kind[]): Steps =>
  act.includes("diff") ? [...steps.filter((g) => g.length), ["diff"]] : steps;

const zeros = (): Record<Kind, number> => ({ service: 0, gst: 0, discount: 0, tip: 0, diff: 0 });

/** Runs the extras over a subtotal, step by step. Integer minor units only. */
export function apply(subtotal: number, adj: Record<Kind, Adj>, steps: Steps) {
  const amts = zeros();
  const bases = zeros();
  let run = subtotal;
  for (const g of steps) {
    const base = run;
    for (const k of g) {
      const a = modeOf(k, adj) === "pct" ? Math.round((base * num(adj[k].val)) / 100) : cents(adj[k].val);
      amts[k] = a;
      bases[k] = base;
      run += k === "discount" ? -a : a;
    }
  }
  return { amts, bases, total: Math.max(0, run), clamped: run < 0 };
}

/**
 * Bill-level maths: the lines, then the extras stacked as `bill.steps` says.
 * With the default steps this is exactly v1's rule — GST on the subtotal,
 * discount and tip both on the post-GST amount.
 */
export function compute(bill: DraftBill): Totals {
  const lines: Line[] = bill.items
    .filter((i) => i.name.trim() || num(i.price) > 0)
    .map((i) => ({
      id: i.id,
      name: i.name.trim() || "Item",
      qty: num(i.qty) || 1,
      amt: Math.round(priceOf(i, bill.priceMode)),
    }));

  const subtotal = lines.reduce((s, l) => s + l.amt, 0);
  const steps = normalise(bill.steps, active(bill.adj));
  const { amts, bases, total, clamped } = apply(subtotal, bill.adj, steps);

  return {
    lines, subtotal, amts, bases, steps, total, clamped,
    serviceAmt: amts.service, gstAmt: amts.gst, discountAmt: amts.discount, tipAmt: amts.tip,
    diffAmt: amts.diff,
  };
}

/* ------------------------------------------------------ choosing a stacking */

/**
 * Every ordered set partition of `kinds`: 1, 3, 13, 75 for one to four. Built
 * by giving each kind a step number and keeping only gap-free numberings,
 * which is 256 candidates at most.
 */
export function arrangements(kinds: readonly Kind[]): Steps[] {
  const n = kinds.length;
  if (!n) return [[]];
  const out: Steps[] = [];
  const lv = new Array<number>(n).fill(0);
  const total = n ** n;
  for (let c = 0; c < total; c += 1) {
    let x = c;
    for (let i = 0; i < n; i += 1) { lv[i] = x % n; x = Math.floor(x / n); }
    const used = Math.max(...lv) + 1;
    let ok = true;
    for (let l = 0; l < used && ok; l += 1) ok = lv.includes(l);
    if (!ok) continue;
    out.push(Array.from({ length: used }, (_, l) => kinds.filter((_, i) => lv[i] === l)));
  }
  return out;
}

/** Each kind's step number, in KINDS order: gst-first sorts before discount-first. */
const rank = (st: Steps): number[] => KINDS.map((k) => st.findIndex((g) => g.includes(k)));

/** Every stacking of the active extras, the balancing row last on each. */
const stackings = (act: readonly Kind[]): Steps[] =>
  arrangements(act.filter((k) => k !== "diff")).map((st) => withDiff(st, act));

/** Where a stacking sits in PRESETS; past the end when it is none of them. */
const presetRank = (st: Steps, act: readonly Kind[]): number => {
  const s = JSON.stringify(st);
  const i = PRESETS.findIndex((p) => JSON.stringify(normalise(p, act)) === s);
  return i < 0 ? PRESETS.length : i;
};

/** Fewer steps first, then the rows' fixed order: the plainest reading wins. */
const simpler = (a: Steps, b: Steps): number => {
  if (a.length !== b.length) return a.length - b.length;
  const ra = rank(a);
  const rb = rank(b);
  for (let i = 0; i < ra.length; i += 1) if (ra[i] !== rb[i]) return ra[i]! - rb[i]!;
  return 0;
};

/** Within this, a computed total counts as the printed one. One major unit. */
export const MATCH_SLACK = 100;

export interface Outcome {
  steps: Steps;
  total: number;
  /** Reproduces the printed total. */
  matches: boolean;
  /** Nothing reproduces the printed total, and this comes nearest. */
  closest: boolean;
  /** Same total as the stacking currently in use. */
  current: boolean;
}

/**
 * The distinct results the extras can produce, for the "worked out" picker.
 * Percentages multiply, so most arrangements collapse onto a few totals —
 * three % rows give 5 outcomes, not 13. People pick a number they can check
 * against the paper, never a structure.
 */
export function outcomes(bill: DraftBill, max = 4): { visible: Outcome[]; more: Outcome[] } {
  const subtotal = compute(bill).subtotal;
  const act = active(bill.adj);
  const curSteps = normalise(bill.steps, act);
  const cur = apply(subtotal, bill.adj, curSteps).total;
  const printed = bill.printedTotal;

  // The stacking in use speaks for its own total, so the list never words the
  // selected option differently from the "worked out" line above it.
  const byTotal = new Map<number, Steps>([[cur, curSteps]]);
  const plainer = (a: Steps, b: Steps) => presetRank(a, act) - presetRank(b, act) || simpler(a, b);
  for (const st of stackings(act)) {
    const t = apply(subtotal, bill.adj, st).total;
    const had = byTotal.get(t);
    if (!had || (t !== cur && plainer(st, had) < 0)) byTotal.set(t, st);
  }

  const all: Outcome[] = [...byTotal].map(([total, steps]) => ({
    steps,
    total,
    matches: printed !== undefined && printed > 0 && Math.abs(total - printed) <= MATCH_SLACK,
    closest: false,
    current: total === cur,
  }));
  if (printed && !all.some((o) => o.matches)) {
    const off = (o: Outcome) => Math.abs(o.total - printed);
    const near = all.reduce((a, b) => (off(b) < off(a) ? b : a), all[0]!);
    near.closest = true;
  }
  all.sort((a, b) =>
    Number(b.matches) - Number(a.matches) ||
    Number(b.closest) - Number(a.closest) ||
    Number(b.current) - Number(a.current) ||
    plainer(a.steps, b.steps));
  return { visible: all.slice(0, max), more: all.slice(max) };
}

const LABEL: Record<Kind, string> = {
  service: "service", gst: "gst", discount: "discount", tip: "tip", diff: "difference",
};
const names = (g: Kind[]): string => g.map((k) => LABEL[k]).join(" & ");

/** A stacking as a sentence someone at the table can check. */
export function sentence(all: Steps, adj: Record<Kind, Adj>): string {
  // The balancing row always goes last and says so itself.
  const steps = all.filter((g) => !g.includes("diff"));
  if (steps.length <= 1) return "all on the food";
  if (steps.length >= 3 && steps.every((g) => g.length === 1)) {
    const flat = steps.some(([k]) => modeOf(k!, adj) === "flat");
    // Order only changes the total when a flat amount is in the chain.
    return flat ? `one after another: ${steps.map(names).join(" → ")}` : "one after another";
  }
  const [first, ...rest] = steps;
  return [`${names(first!)} on the food`, ...rest.map((g) => `then ${names(g)}`)].join(", ");
}

/**
 * Settles a photographed bill: which reading of each extra (its printed
 * rate or its printed amount — `variants`, in order of preference) and
 * which stacking. The first variant with a stacking that reproduces the
 * printed total within a rupee wins: the model's own stacking first, then
 * the earliest preset. When nothing does, the nearest reading is kept and a
 * `diff` row makes up the rest, so what gets split is what was paid; the
 * editor says so for as long as the bill is untouched.
 */
export function detect(
  bill: DraftBill,
  llmSteps: Steps,
  variants: Record<Kind, Adj>[] = [bill.adj],
): { adj: Record<Kind, Adj>; steps: Steps; fit: "match" | "balanced" | "unknown" } {
  const first = variants[0] ?? bill.adj;
  const printed = bill.printedTotal;
  if (!printed) return { adj: first, steps: normalise(llmSteps, active(first)), fit: "unknown" };

  const subtotal = compute(bill).subtotal;
  interface C { adj: Record<Kind, Adj>; steps: Steps; total: number; off: number; v: number; said: boolean; p: number }
  // An exact reading: plainer extras first, then the model's stacking, then the commonest.
  const betterExact = (a: C, b: C) =>
    a.v - b.v || Number(b.said) - Number(a.said) || a.p - b.p || a.off - b.off || simpler(a.steps, b.steps);
  // No exact reading: nearest first.
  const betterNear = (a: C, b: C) =>
    a.off - b.off || a.v - b.v || Number(b.said) - Number(a.said) || a.p - b.p || simpler(a.steps, b.steps);

  let exact = null as C | null;
  let near = null as C | null;
  variants.forEach((adj, v) => {
    const act = active(adj);
    const said = normalise(llmSteps, act);
    [said, ...stackings(act)].forEach((steps, i) => {
      const total = apply(subtotal, adj, steps).total;
      const c: C = { adj, steps, total, off: Math.abs(total - printed), v, said: i === 0, p: presetRank(steps, act) };
      if (c.off <= MATCH_SLACK && (!exact || betterExact(c, exact) < 0)) exact = c;
      if (!near || betterNear(c, near) < 0) near = c;
    });
  });
  if (exact) return { adj: exact.adj, steps: exact.steps, fit: "match" };

  const n = near!;
  const adj = { ...n.adj, diff: { mode: "flat" as const, val: String((printed - n.total) / 100) } };
  return { adj, steps: normalise(n.steps, active(adj)), fit: "balanced" };
}
