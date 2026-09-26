import { Sheet, Head, Underline } from "../ui";
import { tiltStyle } from "../lib/tilt";
import { recentCodes } from "../lib/cache";

/** Three equally weighted ways in, no hierarchy games. Spec §2.1. */
export function Home({
  name, onRename, onCamera, onManual, onJoin, onResume, round, notice, noticeUnder, checking,
}: {
  /** Why a tapped choice can't go ahead (offline, or photos used up), or "". */
  notice: string;
  /** Which choice it belongs under. */
  noticeUnder: "camera" | "join";
  /** Checking with the server before the camera opens. */
  checking: boolean;
  /** An unfinished pass-the-phone round on this device. */
  round: { label: string; open: () => void } | null;
  name: string;
  onRename: () => void;
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

      <p class="scrawl" style={{ margin: "-10px 0 22px" }}>
        hi {name} ·{" "}
        <button class="link" onClick={onRename}>not you?</button>
      </p>

      <div class="stack">
        <button class="choice" style={tiltStyle("home-cam", "card")} onClick={onCamera} disabled={checking} aria-busy={checking}>
          <b>take a pic</b>
          <span class="dim small">
            {checking ? "checking how many photos you have left today…" : "snap the receipt, the lines fill themselves in"}
          </span>
        </button>
        {notice && noticeUnder === "camera" ? <Notice text={notice} onManual={onManual} /> : null}
        <button class="choice" style={tiltStyle("home-man", "card")} onClick={onManual}>
          <b>enter manually</b>
          <span class="dim small">type the items yourself</span>
        </button>
        <button class="choice" style={tiltStyle("home-join", "card")} onClick={onJoin}>
          <b>join a split</b>
          <span class="dim small">someone sent you a code</span>
        </button>
        {notice && noticeUnder === "join" ? <Notice text={notice} onManual={onManual} /> : null}
      </div>

      {recent.length || round ? (
        <div style={{ marginTop: 34 }}>
          <p class="scrawl dim" style={{ margin: "0 0 12px" }}>
            <Underline>still open</Underline>
          </p>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {round ? (
              <button class="stub" style={tiltStyle("r-round", "note")} onClick={round.open}>
                <span style={{ color: "var(--ink)" }}>{round.label}</span>
                <span>&rarr;</span>
              </button>
            ) : null}
            {recent.map((c) => (
              <button
                key={c}
                class="stub"
                style={tiltStyle(`r-${c}`, "note")}
                onClick={() => onResume(c)}
                aria-label={`Reopen the split with code ${c}`}
              >
                {c}
                <span>&rarr;</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <p style={{ marginTop: 40 }}>
        <a class="link" href="/?about">how it works →</a>
      </p>
    </Sheet>
  );
}

/**
 * Said under the choice that was tapped, before anything is attempted. Manual
 * entry and pass the phone need neither the network nor a photo read, so that
 * is always the way out.
 */
function Notice({ text, onManual }: { text: string; onManual: () => void }) {
  return (
    <div class="sticky" role="alert" style={{ "--tilt": "-1.1deg" }}>
      <p class="scrawl" style={{ margin: 0, color: "var(--warn)" }}>{text}</p>
      <button class="btn" style={{ marginTop: 12 }} onClick={onManual}>enter it manually</button>
    </div>
  );
}
