import type { ComponentChildren } from "preact";
import { Sheet, Head, Amount } from "../ui";
import { fmt } from "../lib/money";
import { spread, shareOf } from "../lib/split";
import { paletteFor } from "../lib/identity";
import type { Round } from "../lib/round";

/** Everyone's number, one phone. Tap a name to fix that person's turn. */
export function Tally({
  round, onRedo, onToggleLeftovers, onBack, children,
}: {
  round: Round;
  onRedo: (index: number) => void;
  onToggleLeftovers: () => void;
  onBack: () => void;
  /** The share block. */
  children?: ComponentChildren;
}) {
  const { meta, people } = round;
  const money = (c: number) => fmt(c, meta.currency, true);
  const { subShare, loose } = spread(meta, people);
  const palette = paletteFor(people.map((p) => p.key));

  return (
    <Sheet>
      <Head entry="entry no. 09 · the tally" title={meta.billName} onBack={onBack} />

      <h2 style={{ fontSize: "var(--step-1)" }}>who owes what</h2>
      <div>
        {people.map((p, i) => (
          <button
            key={p.key}
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

      <p class="scrawl dim" style={{ marginTop: 14 }}>tap a name to redo their turn</p>

      {children}
    </Sheet>
  );
}
