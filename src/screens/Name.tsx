import { useState } from "preact/hooks";
import { Sheet, Head, Write } from "../ui";
import { tiltStyle } from "../lib/tilt";
import { loadBank, saveBank } from "../lib/cache";

/**
 * The first thing the app ever asks, and then never again. One field, one
 * button: every later screen that used to ask for a name reads this instead.
 */
export function Name({
  initial, onSave, onBack,
}: {
  initial: string;
  onSave: (name: string) => void;
  onBack?: () => void;
}) {
  const [name, setName] = useState(initial);
  const [bank, setBank] = useState(loadBank);
  const go = (e: Event) => {
    e.preventDefault();
    if (!name.trim()) return;
    saveBank(bank);
    onSave(name);
  };
  return (
    <Sheet>
      <Head
        entry="entry no. 00"
        title="who's this?"
        note="so people know whose share is whose. asked once."
        onBack={onBack}
      />
      <form onSubmit={go}>
        <Write
          label="your name"
          placeholder="faraz"
          value={name}
          maxLength={24}
          autoComplete="given-name"
          autoFocus
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
        <BankField value={bank} onInput={setBank} style={{ marginTop: 22 }} />
        <button
          class="btn"
          type="submit"
          style={{ ...tiltStyle("go-name", "card"), marginTop: 34 }}
          disabled={!name.trim()}
        >
          that's me →
        </button>
      </form>
    </Sheet>
  );
}

/** Optional, multiline, kept on this device: shown under a summary when asked. */
export function BankField({
  value, onInput, style,
}: {
  value: string;
  onInput: (v: string) => void;
  style?: Record<string, string | number>;
}) {
  return (
    <label for="f-bank" style={{ display: "block", ...style }}>
      <span class="eyebrow">bank details <span class="dim">(optional)</span></span>
      <textarea
        id="f-bank"
        class="write"
        rows={3}
        maxLength={300}
        placeholder={"meezan bank · faraz ahmed\nPK00 MEZN 0000 0000 0000 0000"}
        value={value}
        onInput={(e) => onInput((e.target as HTMLTextAreaElement).value)}
      />
    </label>
  );
}
