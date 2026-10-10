import { Sheet, Head, Amount, Reveal } from "../ui";
import { fmt } from "../lib/money";
import { spread, shareOf } from "../lib/split";
import { paletteFor } from "../lib/identity";
import type { Round } from "../lib/round";
import { billSummary } from "../lib/summary";
import { ShareBlock, PayNote, useShareOpts } from "./ShareBlock";

/** Everyone's number, one phone. Tap a name to fix that person's turn. */
export function Tally({
  round, onRedo, onToggleLeftovers, onBack, flash,
}: {
  round: Round;
  onRedo: (index: number) => void;
  onToggleLeftovers: () => void;
  onBack: () => void;
  flash: (m: string) => void;
}) {
  const { meta, people } = round;
  const money = (c: number) => fmt(c, meta.currency, true);
  const { subShare, loose } = spread(meta, people);
  const palette = paletteFor(people.map((p) => p.key));
  const opts = useShareOpts();
  // Always built with items, so closing the box can animate them away.
  const { rows } = billSummary(meta, people, palette, true);

  return (
    <Sheet>
      <Head entry="entry no. 09 · the tally" title={meta.billName} onBack={onBack} />

      <h2 style={{ fontSize: "var(--step-1)" }}>who owes what</h2>
      <div>
        {people.map((p, i) => (
          <div key={p.key} class="person">
            <button
              class="item row"
              style={{ display: "flex", alignItems: "center" }}
              onClick={() => onRedo(i)}
              aria-label={`${p.name} owes ${money(shareOf(meta, subShare[p.key] ?? 0))}. Tap to redo their turn.`}
            >
              <span>
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-block", width: 9, height: 9, borderRadius: "50%",
                    background: palette[p.key], marginRight: 8,
                  }}
                />
                {p.name}
              </span>
              <Amount value={money(shareOf(meta, subShare[p.key] ?? 0))} />
            </button>
            <Reveal open={opts.withItems}>
              <ul class="person-items dim">
                {(rows[i]?.items ?? []).map((it, j) => (
                  <li key={j} class="row">
                    <span>{it.name}{it.frac ? ` ${it.frac}` : ""}</span>
                    <Amount value={money(it.amt)} dim />
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        ))}
      </div>

      <hr class="rule-dash" />
      <div class="row" style={{ alignItems: "center" }}>
        <span>
          <span class="dim">nobody's claimed </span>
          <Amount value={money(shareOf(meta, loose))} dim={loose === 0} />
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
      <div class="row">
        <span class="dim">the bill</span>
        <Amount value={money(meta.total)} />
      </div>

      <PayNote opts={opts} />

      <p class="scrawl dim" style={{ marginTop: 14 }}>tap a name to redo their turn</p>

      <ShareBlock make={(w) => billSummary(meta, people, palette, w)} opts={opts} flash={flash} />
    </Sheet>
  );
}
