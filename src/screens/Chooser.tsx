import { Sheet, Head, Write } from "../ui";
import { tiltStyle } from "../lib/tilt";

/**
 * After the editor: what is it called, and how is it being split. The name
 * arrives filled in (the place off the bill, or when you ate), so most people
 * just pick a card.
 */
export function Chooser({
  billName, setBillName, fallback, onLink, onPhone, onBack, busy, error,
}: {
  billName: string;
  setBillName: (v: string) => void;
  /** What an emptied field turns into. */
  fallback: string;
  onLink: () => void;
  onPhone: () => void;
  onBack: () => void;
  busy: boolean;
  error: string;
}) {
  return (
    <Sheet>
      <Head
        entry="entry no. 06"
        title="how are you splitting?"
        onBack={onBack}
        error={error}
      />

      <Write
        label="what was it"
        placeholder={fallback}
        value={billName}
        maxLength={40}
        onInput={(e) => setBillName((e.target as HTMLInputElement).value)}
      />

      <div class="stack-lg" style={{ marginTop: 30 }}>
        <button class="choice" style={tiltStyle("ch-link", "card")} onClick={onLink} disabled={busy}>
          <b>{busy ? "opening…" : "share the link"}</b>
          <span class="dim small">everyone taps on their own phone</span>
          <span class="scrawl" style={{ display: "block", color: "var(--rose)", marginTop: 4 }}>
            recommended for 5 or more
          </span>
        </button>
        <button class="choice" style={tiltStyle("ch-phone", "card")} onClick={onPhone} disabled={busy}>
          <b>pass the phone</b>
          <span class="dim small">one phone goes round the table</span>
          <span class="scrawl" style={{ display: "block", color: "var(--rose)", marginTop: 4 }}>
            recommended for under 5
          </span>
        </button>
      </div>
    </Sheet>
  );
}
