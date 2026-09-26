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

/** The extras a bill can carry. Discount is the only one that subtracts. */
export type Kind = "service" | "gst" | "discount" | "tip";
export const KINDS: readonly Kind[] = ["service", "gst", "discount", "tip"];

/**
 * How the extras stack: ordered groups ("steps"). Every % in step 1 is of the
 * subtotal; every % in step 2 is of the running total after step 1; and so on.
 * Rows sharing a step share a base. `[["gst"], ["discount", "tip"]]` is the
 * v1 rule.
 */
export type Steps = Kind[][];
export const DEFAULT_STEPS: Steps = [["service", "gst"], ["discount", "tip"]];

export interface Adj { mode: AmountMode; val: string }

export interface DraftBill {
  currency: string;
  priceMode: PriceMode;
  items: DraftItem[];
  /** GST is always a percentage; its mode is ignored. */
  adj: Record<Kind, Adj>;
  steps: Steps;
  /** The total printed on the photographed bill, minor units, if one was read. */
  printedTotal?: number;
}

export const noAdj = (): Record<Kind, Adj> => ({
  service: { mode: "pct", val: "" },
  gst: { mode: "pct", val: "" },
  discount: { mode: "flat", val: "" },
  tip: { mode: "flat", val: "" },
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
export const active = (adj: Record<Kind, Adj>): Kind[] => KINDS.filter((k) => num(adj[k].val) > 0);

const modeOf = (k: Kind, adj: Record<Kind, Adj>): AmountMode => (k === "gst" ? "pct" : adj[k].mode);

/**
 * Steps restricted to the active extras, empty steps closed up. An extra the
 * steps don't mention goes where v1 put it: charges on the food (service,
 * gst) into the first step, discount and tip into the last.
 */
export function normalise(steps: Steps, act: readonly Kind[]): Steps {
  const on = new Set(act);
  const out = steps.map((g) => g.filter((k) => on.has(k))).filter((g) => g.length > 0);
  const seen = new Set(out.flat());
  for (const k of KINDS) {
    if (!on.has(k) || seen.has(k)) continue;
    if (!out.length) out.push([]);
    const g = k === "service" || k === "gst" ? out[0] : out[out.length - 1];
    g!.push(k);
    seen.add(k);
  }
  // Canonical order inside a step: rows in one step commute.
  return out.map((g) => KINDS.filter((k) => g.includes(k)));
}

const zeros = (): Record<Kind, number> => ({ service: 0, gst: 0, discount: 0, tip: 0 });

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
  for (const st of arrangements(act)) {
    const t = apply(subtotal, bill.adj, st).total;
    const had = byTotal.get(t);
    if (!had || (t !== cur && simpler(st, had) < 0)) byTotal.set(t, st);
  }

  const all: Outcome[] = [...byTotal].map(([total, steps]) => ({
    steps,
    total,
    matches: printed !== undefined && printed > 0 && Math.abs(total - printed) <= MATCH_SLACK,
    current: total === cur,
  }));
  all.sort((a, b) =>
    Number(b.matches) - Number(a.matches) ||
    Number(b.current) - Number(a.current) ||
    simpler(a.steps, b.steps));
  return { visible: all.slice(0, max), more: all.slice(max) };
}

const LABEL: Record<Kind, string> = { service: "service", gst: "gst", discount: "discount", tip: "tip" };
const names = (g: Kind[]): string => g.map((k) => LABEL[k]).join(" & ");

/** A stacking as a sentence someone at the table can check. */
export function sentence(steps: Steps, adj: Record<Kind, Adj>): string {
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
 * Settles the stacking for a photographed bill. The model's reading is used
 * when it reproduces the printed total; otherwise every arrangement is tried
 * and the closest one within a rupee wins; otherwise the model's reading
 * stands and the editor says the numbers don't meet.
 */
export function detect(
  bill: DraftBill,
  llmSteps: Steps,
): { steps: Steps; fit: "match" | "none" | "unknown" } {
  const act = active(bill.adj);
  const said = normalise(llmSteps, act);
  const printed = bill.printedTotal;
  if (!printed) return { steps: said, fit: "unknown" };

  const subtotal = compute(bill).subtotal;
  const off = (st: Steps) => Math.abs(apply(subtotal, bill.adj, st).total - printed);
  if (off(said) <= MATCH_SLACK) return { steps: said, fit: "match" };

  let best: Steps | null = null;
  for (const st of arrangements(act)) {
    if (off(st) > MATCH_SLACK) continue;
    if (!best || off(st) < off(best) || (off(st) === off(best) && simpler(st, best) < 0)) best = st;
  }
  return best ? { steps: best, fit: "match" } : { steps: said, fit: "none" };
}
