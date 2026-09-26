import { useEffect, useRef, useState } from "preact/hooks";
import { Amount } from "../ui";
import type { Line } from "../lib/money";
import type { Claims, Person } from "../lib/split";
import { tiltStyle } from "../lib/tilt";

/**
 * The tap list: whole-row targets, claimer chips, and the ×N stepper on the
 * active person's own chip. Shared by the live split and pass the phone, so
 * the two can never drift apart in how a claim looks or works.
 */
export function ItemList({
  lines, byLine, mine, activeKey, palette, onTap, onBump, money, quiet = false,
}: {
  lines: Line[];
  byLine: Record<string, Person[]>;
  /** The active person's claims (optimistic in the live split). */
  mine: Claims;
  activeKey: string;
  palette: Record<string, string>;
  onTap: (lineId: string) => void;
  onBump: (lineId: string, delta: number) => void;
  money: (c: number) => string;
  /** Nothing "arrives" on a passed phone, so chips shouldn't animate in. */
  quiet?: boolean;
}) {
  return (
    <div class="lines">
      {lines.map((line) => {
        const on = byLine[line.id] ?? [];
        const myPortions = mine[line.id] ?? 0;
        return (
          <button
            key={line.id}
            class={myPortions ? "item on" : "item"}
            onClick={() => onTap(line.id)}
            aria-pressed={myPortions > 0}
          >
            <div class="row">
              <span style={{ flex: 1 }}>
                {line.name}
                {line.qty > 1 ? <span class="dim small"> ×{line.qty}</span> : null}
              </span>
              <Amount value={money(line.amt)} dim={!myPortions} />
            </div>

            {on.length ? (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
                {on.map((p) => (
                  <Chip
                    key={p.key}
                    person={p}
                    lineId={line.id}
                    isMe={p.key === activeKey}
                    quiet={quiet}
                    onBump={onBump}
                    colour={palette[p.key] as string}
                  />
                ))}
              </div>
            ) : null}
          </button>
        );
      })}
    </div>

  );
}

/** A claimer's chip. Yours carries the ×N stepper; nobody else's does. */
function Chip({
  person, lineId, isMe, onBump, colour, quiet,
}: {
  person: Person;
  lineId: string;
  isMe: boolean;
  quiet: boolean;
  onBump: (lineId: string, delta: number) => void;
  colour: string;
}) {
  const n = person.claims[lineId] ?? 0;
  const seen = useRef(false);
  const [landed, setLanded] = useState(false);

  // A claim arriving from another device should be noticed, not just appear.
  useEffect(() => {
    if (seen.current) return;
    seen.current = true;
    if (!isMe && !quiet) {
      setLanded(true);
      const t = setTimeout(() => setLanded(false), 400);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isMe, quiet]);

  const stop = (e: Event, d: number) => {
    e.stopPropagation();
    onBump(lineId, d);
  };

  return (
    <span
      class={`chip${landed ? " landed" : ""}`}
      style={{ ...tiltStyle(`${person.key}-${lineId}`, "scrap"), background: colour }}
    >
      {person.name}
      {isMe ? (
        <>
          <button class="step" onClick={(e) => stop(e, -1)} aria-label="One fewer portion">−</button>
          {n > 1 ? <span class="amt">×{n}</span> : null}
          <button class="step" onClick={(e) => stop(e, 1)} aria-label="One more portion">+</button>
        </>
      ) : n > 1 ? (
        <span class="amt">×{n}</span>
      ) : null}
    </span>
  );
}
