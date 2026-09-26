import { useEffect, useRef, useState } from "preact/hooks";
import { Sheet, Head, Amount } from "../ui";
import { tiltStyle } from "../lib/tilt";
import { dupes } from "../lib/round";
import { identityOf, nameKey } from "../lib/identity";

/**
 * Who's at the table. The stepper and the inputs are one list: + adds a line
 * and puts the cursor on it, − takes the last one away. Row 1 arrives as you.
 */
export function Table({
  initial, onStart, onBack,
}: {
  initial: string[];
  onStart: (names: string[]) => void;
  onBack: () => void;
}) {
  const [names, setNames] = useState(initial.length ? initial : [""]);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [focus, setFocus] = useState<number | null>(null);

  useEffect(() => {
    if (focus === null) return;
    refs.current[focus]?.focus();
    setFocus(null);
  }, [focus]);

  const add = () => { setNames([...names, ""]); setFocus(names.length); };
  const drop = () => { if (names.length > 1) setNames(names.slice(0, -1)); };
  const set = (i: number, v: string) => setNames(names.map((n, j) => (j === i ? v : n)));

  const clash = dupes(names);
  const ready = names.every((n) => n.trim()) && clash.size === 0;
  // Say it once per clash, under the last of the matching names.
  const lastOfClash = (i: number) =>
    clash.has(i) && names.slice(i + 1).every((n) => nameKey(n) !== nameKey(names[i] ?? ""));

  return (
    <Sheet>
      <Head
        entry="entry no. 07"
        title="who's at the table"
        note="everyone gets a turn with the phone, in this order."
        onBack={onBack}
      />

      <div class="row" style={{ justifyContent: "center", alignItems: "center", gap: 18, margin: "8px 0 20px" }}>
        <button class="tiny" onClick={drop} disabled={names.length <= 1} aria-label="One fewer person">−</button>
        <Amount value={String(names.length)} size="md" />
        <button class="tiny" onClick={add} aria-label="One more person">+</button>
      </div>

      <div class="stack">
        {names.map((n, i) => (
          <div key={i}>
            <label class="row" style={{ alignItems: "end" }}>
              <span class="amt dim" style={{ width: "1.6rem" }}>{i + 1}</span>
              <span class="sr-only">Person {i + 1}</span>
              <input
                ref={(el) => { refs.current[i] = el; }}
                class="write"
                value={n}
                maxLength={24}
                placeholder={i === 0 ? "you" : "name"}
                enterKeyHint={i === names.length - 1 ? "done" : "next"}
                onInput={(e) => set(i, (e.target as HTMLInputElement).value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (i < names.length - 1) setFocus(i + 1);
                  else if (n.trim()) add();
                }}
              />
            </label>
            {lastOfClash(i) ? (
              <p class="scrawl" style={{ color: "var(--warn)", margin: "4px 0 0 1.6rem" }}>
                two {nameKey(n)}s → add an initial
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <button
        class="btn"
        style={{ ...tiltStyle("go-table", "card"), marginTop: 34 }}
        onClick={() => onStart(names)}
        disabled={!ready}
      >
        start → {identityOf(names[0] ?? "").name || "…"} goes first
      </button>
    </Sheet>
  );
}
