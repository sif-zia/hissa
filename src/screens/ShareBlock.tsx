import { useEffect, useRef, useState } from "preact/hooks";
import { copy, shareImage, site } from "../lib/share";
import { drawCard } from "../lib/card";
import { summaryText, type Summary } from "../lib/summary";
import { loadPref, savePref } from "../lib/cache";

/**
 * The end of every split: copy the result as text, or share it as a card.
 * One `with items` toggle drives both, remembered on the device.
 */
export function ShareBlock({
  make, items = true, flash,
}: {
  /** The result, with or without each person's items. */
  make: (withItems: boolean) => Summary;
  /** Offer the toggle at all (an equal split has no items). */
  items?: boolean;
  flash: (m: string) => void;
}) {
  const [withItems, setWithItems] = useState(() => loadPref<boolean>("withItems") === true);
  const on = items && withItems;
  const summary = make(on);
  const text = summaryText(summary, site());
  const filename = `hissa-${summary.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;

  // Pre-render, so the tap goes straight to the share sheet (see shareImage).
  const [blob, setBlob] = useState<Blob | null>(null);
  const latest = useRef(text);
  latest.current = text;
  useEffect(() => {
    setBlob(null);
    const t = setTimeout(() => {
      void drawCard(summary).then((b) => { if (latest.current === text) setBlob(b); }, () => undefined);
    }, 300);
    return () => clearTimeout(t);
    // `text` changes exactly when the card's content does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const toggle = () => {
    setWithItems(!withItems);
    savePref("withItems", !withItems);
  };

  const sendImage = async () => {
    const b = blob ?? (await drawCard(summary));
    const how = await shareImage(b, text, filename);
    if (how !== "failed") flash(how === "shared" ? "shared" : "image saved");
  };

  return (
    <div style={{ marginTop: 26 }}>
      <hr class="rule-dash" />
      {items ? (
        <button
          class={on ? "tiny on" : "tiny"}
          onClick={toggle}
          aria-pressed={on}
          style={{ marginBottom: 14 }}
        >
          with items {on ? "✓" : ""}
        </button>
      ) : null}
      <div class="row" style={{ gap: 10 }}>
        <button class="btn" style={{ flex: 1 }} onClick={() => void sendImage()}>
          share as image
        </button>
        <button
          class="btn btn-alt"
          style={{ flex: "0 0 32%" }}
          onClick={async () => flash((await copy(text)) ? "copied" : "couldn't copy")}
        >
          copy
        </button>
      </div>
    </div>
  );
}
