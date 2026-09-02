import { Sheet, Head, Underline } from "../ui";
import { tiltStyle } from "../lib/tilt";
import { recentCodes } from "../lib/cache";

/** Three equally weighted ways in, no hierarchy games. Spec §2.1. */
export function Home({
  onCamera, onManual, onJoin, onResume,
}: {
  onCamera: () => void;
  onManual: () => void;
  onJoin: () => void;
  onResume: (code: string) => void;
}) {
  const recent = recentCodes();
  return (
    <Sheet>
      <Head
        entry="entry no. 01"
        title="split a bill"
        note="three ways in. pick one, you're two taps from a number."
      />

      <div class="stack">
        <button class="choice" style={tiltStyle("home-cam", 0.5)} onClick={onCamera}>
          <b>take a pic</b>
          <span class="dim small">snap the receipt, the lines fill themselves in</span>
        </button>
        <button class="choice" style={tiltStyle("home-man", 0.5)} onClick={onManual}>
          <b>enter manually</b>
          <span class="dim small">type the items yourself</span>
        </button>
        <button class="choice" style={tiltStyle("home-join", 0.5)} onClick={onJoin}>
          <b>join a split</b>
          <span class="dim small">someone sent you a code</span>
        </button>
      </div>

      {recent.length ? (
        <div style={{ marginTop: 30 }}>
          <p class="scrawl dim" style={{ margin: "0 0 6px" }}>
            <Underline>still open</Underline>
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {recent.map((c) => (
              <button
                key={c}
                class="tiny amt"
                style={tiltStyle(`r-${c}`, 0.5)}
                onClick={() => onResume(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
