import { useEffect, useRef, useState } from "preact/hooks";
import { Sheet, Head, Amount } from "../ui";
import { fmt } from "../lib/money";
import { spread, shareOf, type BillMeta, type Claims, type Person } from "../lib/split";
import { paletteFor, type Identity } from "../lib/identity";
import { tiltStyle } from "../lib/tilt";

/**
 * Tap to claim. Whole-row targets, claimer chips, live per-person totals, and
 * your own number pinned to the bottom so it never needs scrolling. Spec §2.7.
 */
export function Split({
  meta, people, me, mine, onTap, onBump, onToggleLeftovers, onShare, onRefresh,
  live, refreshing, stale, error, onBack,
}: {
  meta: BillMeta;
  people: Person[];
  me: Identity;
  mine: Claims;
  onTap: (lineId: string) => void;
  onBump: (lineId: string, delta: number) => void;
  onToggleLeftovers: () => void;
  onShare: () => void;
  onRefresh: () => void;
  live: boolean;
  refreshing: boolean;
  stale: boolean;
  error: string;
  onBack: () => void;
}) {
  const cur = meta.currency;
  const money = (c: number) => fmt(c, cur, true);

  // My own claims come from local optimistic state, everyone else's from the
  // last poll, so a tap never waits on the network.
  const everyone: Person[] = [
    { key: me.key, name: me.name, claims: mine },
    ...people.filter((p) => p.key !== me.key),
  ];

  const { subShare, loose, byLine } = spread(meta, everyone);
  // Built from every key on the bill, so it is identical on every device.
  const palette = paletteFor(everyone.map((p) => p.key));
  const myTotal = shareOf(meta, subShare[me.key] ?? 0);
  const looseTotal = shareOf(meta, loose);

  return (
    <Sheet>
      <div class="row" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <Head entry={`code ${meta.code}`} title={meta.billName} onBack={onBack} error={error} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        <button class="tiny" onClick={onShare}>share the link</button>
        <button class="tiny amt" onClick={onShare} aria-label={`Bill code ${meta.code}, tap to share`}>
          {meta.code}
        </button>
        {stale ? <span class="tiny" style={{ borderStyle: "dotted", opacity: 0.7 }}>catching up…</span> : null}
      </div>

      <div class="lines">
        {meta.lines.map((line) => {
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
                      isMe={p.key === me.key}
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

      <hr class="rule-dash" style={{ marginTop: 20 }} />

      <div class="row" style={{ alignItems: "center" }}>
        <span>
          <span class="dim">nobody's claimed </span>
          <Amount value={money(looseTotal)} dim={loose === 0} />
        </span>
        <button
          class={meta.splitUnclaimed ? "tiny on" : "tiny"}
          onClick={onToggleLeftovers}
          aria-pressed={meta.splitUnclaimed}
        >
          {meta.splitUnclaimed ? "sharing leftovers" : "share leftovers"}
        </button>
      </div>

      <hr class="rule-dash" />

      <h2 style={{ fontSize: "var(--step-1)", marginTop: 22 }}>who owes what</h2>
      <div>
        {everyone.map((p) => (
          <div class="row" key={p.key} style={{ padding: "7px 0", borderBottom: "1.5px dashed var(--ink-line)" }}>
            <span>
              <span
                aria-hidden="true"
                style={{
                  display: "inline-block", width: 9, height: 9, borderRadius: "50%",
                  background: palette[p.key], marginRight: 8,
                }}
              />
              {p.name}
              {p.key === me.key ? <span class="scrawl" style={{ color: "var(--rose)" }}> ← you</span> : null}
            </span>
            <Amount value={money(shareOf(meta, subShare[p.key] ?? 0))} dim={p.key !== me.key} />
          </div>
        ))}
      </div>

      <p class="scrawl dim small" style={{ marginTop: 20 }}>
        {live
          ? "learned → other people's taps land within about five seconds."
          : "this split has been open a while → hit refresh to pull in anything new."}
      </p>

      <div class="bar">
        <div class="bar-in">
          <span>
            <div class="eyebrow" style={{ color: "inherit", opacity: 0.65 }}>your hissa</div>
            <Amount value={money(myTotal)} size="md" />
          </span>
          <button class="ghost" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? "…" : "refresh"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/** A claimer's chip. Yours carries the ×N stepper; nobody else's does. */
function Chip({
  person, lineId, isMe, onBump, colour,
}: {
  person: Person;
  lineId: string;
  isMe: boolean;
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
    if (!isMe) {
      setLanded(true);
      const t = setTimeout(() => setLanded(false), 400);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isMe]);

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
