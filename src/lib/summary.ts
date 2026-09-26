/**
 * What gets shared at the end of a split: one shape, rendered two ways —
 * plain text for WhatsApp, and a card image. Built from spread()/shareOf(),
 * never from a second pass over the maths, so the shared numbers are the
 * numbers on screen.
 */

import { fmt } from "./money";
import { spread, shareOf, equalSplit, type BillMeta, type Person } from "./split";

export interface SummaryItem { name: string; frac: string; amt: number }
export interface SummaryRow { name: string; colour?: string; amt: number; items?: SummaryItem[] }

export interface Summary {
  title: string;
  date: string;
  currency: string;
  rows: SummaryRow[];
  total: number;
  /** "nobody's claimed Rs 464" or "1 pays Rs 1,103" — said once, under the rows. */
  note?: string;
}

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "sat 26 sep". Built by hand: en-GB spells September "Sept". */
export const shortDate = (at: number): string => {
  const d = new Date(at);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** A person's part of a line: "" for all of it, else "1/2", "2/3". Plain
 *  digits: the subset fonts carry no ½ glyph. */
export function fraction(portions: number, units: number): string {
  if (portions <= 0 || units <= 0 || portions >= units) return "";
  const g = gcd(portions, units);
  return `${portions / g}/${units / g}`;
}

export function billSummary(
  meta: BillMeta,
  people: Person[],
  palette: Record<string, string>,
  withItems: boolean,
): Summary {
  const { subShare, loose, cuts, leftover } = spread(meta, people);
  const rows: SummaryRow[] = people.map((p) => {
    const amt = shareOf(meta, subShare[p.key] ?? 0);
    const row: SummaryRow = { name: p.name, colour: palette[p.key], amt };
    if (!withItems) return row;
    const items: SummaryItem[] = [];
    let raw = 0;
    for (const line of meta.lines) {
      const cut = cuts[line.id]?.[p.key];
      if (!cut) continue;
      const units = people.reduce((s, q) => s + (q.claims[line.id] ?? 0), 0);
      items.push({ name: line.name, frac: fraction(p.claims[line.id] ?? 0, units), amt: cut });
      raw += cut;
    }
    if (leftover[p.key]) {
      items.push({ name: "leftovers", frac: "", amt: leftover[p.key]! });
      raw += leftover[p.key]!;
    }
    // Tax, service, discount and tip ride along proportionally (spec §3.3);
    // say how much, so the items visibly add up to the person's number.
    if (items.length && amt !== raw) items.push({ name: "extras", frac: "", amt: amt - raw });
    row.items = items;
    return row;
  });

  const looseTotal = shareOf(meta, loose);
  return {
    title: meta.billName,
    date: shortDate(meta.at),
    currency: meta.currency,
    rows,
    total: meta.total,
    note: looseTotal > 0 ? `nobody's claimed ${fmt(looseTotal, meta.currency, true)}` : undefined,
  };
}

export function equalSummary(total: number, n: number, currency: string, at: number): Summary {
  const { base, extra } = equalSplit(total, n);
  return {
    title: `split ${n} ways`,
    date: shortDate(at),
    currency,
    rows: [{ name: n === 1 ? "just you" : `each of ${n}`, amt: base }],
    total,
    note: extra > 0
      ? `${extra} ${extra === 1 ? "person pays" : "people pay"} ${fmt(base + 1, currency, true)}`
      : undefined,
  };
}

/** Plain lines: pastes cleanly into WhatsApp, no tables, no alignment tricks. */
export function summaryText(s: Summary, site: string): string {
  const m = (c: number) => fmt(c, s.currency, true);
  const out = [`${s.title} · ${s.date}`];
  for (const r of s.rows) {
    out.push(`${r.name} — ${m(r.amt)}`);
    for (const i of r.items ?? []) out.push(`  ${i.name}${i.frac ? ` ${i.frac}` : ""} · ${m(i.amt)}`);
  }
  out.push(`total ${m(s.total)}`);
  if (s.note) out.push(s.note);
  out.push("", `split with hissa · ${site}`);
  return out.join("\n");
}
