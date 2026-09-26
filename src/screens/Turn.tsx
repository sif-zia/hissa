import { useState } from "preact/hooks";
import { Sheet, Head, Amount } from "../ui";
import { ItemList } from "./ItemList";
import { fmt } from "../lib/money";
import { spread, shareOf } from "../lib/split";
import { paletteFor } from "../lib/identity";
import { tiltStyle } from "../lib/tilt";
import type { Round } from "../lib/round";

/**
 * One person's turn with the phone. Everyone after the first gets a handoff
 * card first, so tapping starts with the phone in the right hands. Earlier
 * people's chips stay visible: a shared plate should look shared.
 */
export function Turn({
  round, index, onTap, onBump, onDone, onBack,
}: {
  round: Round;
  index: number;
  onTap: (lineId: string) => void;
  onBump: (lineId: string, delta: number) => void;
  onDone: () => void;
  onBack: () => void;
}) {
  const { meta, people } = round;
  const person = people[index]!;
  const [handed, setHanded] = useState(index === 0 || round.redo);
  const money = (c: number) => fmt(c, meta.currency, true);

  if (!handed) {
    return (
      <Sheet>
        <button class="link" onClick={onBack} style={{ marginBottom: 10 }}>← back</button>
        <div class="eyebrow">turn {index + 1} of {people.length}</div>
        <div style={{ minHeight: "58dvh", display: "grid", placeItems: "center", textAlign: "center" }}>
          <div>
            <h1 class="tilt" style={tiltStyle(`hand-${person.key}`, "page")}>it's {person.name}'s turn</h1>
            <p class="scrawl dim" style={{ margin: "0 0 30px" }}>pass the phone to {person.name}</p>
            <button class="btn" style={tiltStyle(`hand-go-${person.key}`, "card")} onClick={() => setHanded(true)}>
              i'm {person.name} →
            </button>
          </div>
        </div>
      </Sheet>
    );
  }

  const { subShare, byLine } = spread(meta, people);
  const palette = paletteFor(people.map((p) => p.key));
  const next = people[index + 1];
  const last = round.redo || !next;

  return (
    <Sheet>
      <Head
        entry={`turn ${index + 1} of ${people.length} · ${meta.billName}`}
        title={`${person.name}'s turn`}
        note="tap what you had. shared a plate? tap it too, and − + sets your portions."
        onBack={onBack}
      />

      <hr class="rule-dash" />
      <ItemList
        lines={meta.lines}
        byLine={byLine}
        mine={person.claims}
        activeKey={person.key}
        palette={palette}
        onTap={onTap}
        onBump={onBump}
        money={money}
        quiet
      />
      <hr class="rule-dash" />

      <div class="bar">
        <div class="bar-in">
          <span>
            <div class="eyebrow" style={{ color: "inherit", opacity: 0.65 }}>{person.name}'s hissa</div>
            <Amount value={money(shareOf(meta, subShare[person.key] ?? 0))} size="md" />
          </span>
          <button class="ghost" onClick={onDone}>
            {round.redo ? "done → back to the tally" : last ? "done → see the tally" : `done → pass to ${next!.name}`}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
