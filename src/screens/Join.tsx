import { Sheet, Head, Write } from "../ui";
import { tiltStyle } from "../lib/tilt";

export function Join({
  code, setCode, name, setName, onGo, onBack, busy, error,
}: {
  code: string;
  setCode: (v: string) => void;
  /** Only when switching identity on one split ("not faraz?"). Otherwise the
   *  stored name is used and nobody types it again. */
  name?: string;
  setName?: (v: string) => void;
  onGo: () => void;
  onBack: () => void;
  busy: boolean;
  error: string;
}) {
  return (
    <Sheet>
      <Head
        entry="entry no. 07"
        title="join a split"
        note="the four letters someone read out at the table."
        onBack={onBack}
        error={error}
      />

      <div class="stack-lg">
        <Write
          label="code"
          class="amt"
          placeholder="KQF4"
          value={code}
          maxLength={8}
          autoCapitalize="characters"
          autoCorrect="off"
          spellcheck={false}
          style={{ fontSize: "var(--step-2)", letterSpacing: "0.2em" }}
          onInput={(e) =>
            setCode((e.target as HTMLInputElement).value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
          }
        />
        {setName ? (
        <Write
          label="your name"
          placeholder="sara"
          value={name}
          maxLength={24}
          autoComplete="given-name"
          hint="same name as last time puts you back on your own claims"
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
        ) : null}
      </div>

      <button
        class="btn"
        style={{ ...tiltStyle("go-join", "card"), marginTop: 34 }}
        onClick={onGo}
        disabled={busy || !code.trim() || (setName ? !name?.trim() : false)}
      >
        {busy ? "looking…" : "join"}
      </button>
    </Sheet>
  );
}
