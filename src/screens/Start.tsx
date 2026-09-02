import { Sheet, Head, Write } from "../ui";
import { tiltStyle } from "../lib/tilt";

/** Two fields, one of them optional. Spec §2.6. */
export function Start({
  hostName, setHostName, billName, setBillName, onGo, onBack, busy, error,
}: {
  hostName: string;
  setHostName: (v: string) => void;
  billName: string;
  setBillName: (v: string) => void;
  onGo: () => void;
  onBack: () => void;
  busy: boolean;
  error: string;
}) {
  return (
    <Sheet>
      <Head
        entry="entry no. 06"
        title="who's asking"
        note="your name goes on the split so people know whose is whose."
        onBack={onBack}
        error={error}
      />

      <div class="stack-lg">
        <Write
          label="your name"
          placeholder="faraz"
          value={hostName}
          maxLength={24}
          autoComplete="given-name"
          onInput={(e) => setHostName((e.target as HTMLInputElement).value)}
        />
        <Write
          label="what was it (optional)"
          placeholder="thursday at kolachi"
          value={billName}
          maxLength={40}
          hint="left blank → we'll scribble a three-letter name on it"
          onInput={(e) => setBillName((e.target as HTMLInputElement).value)}
        />
      </div>

      <button
        class="btn"
        style={{ ...tiltStyle("go-open", 0.3), marginTop: 34 }}
        onClick={onGo}
        disabled={busy || !hostName.trim()}
      >
        {busy ? "opening…" : "open the split"}
      </button>
    </Sheet>
  );
}
