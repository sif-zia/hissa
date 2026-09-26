import { useState } from "preact/hooks";
import { Sheet, Head, Write } from "../ui";
import { tiltStyle } from "../lib/tilt";

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
  const go = (e: Event) => {
    e.preventDefault();
    if (name.trim()) onSave(name);
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
