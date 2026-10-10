import { useEffect, useRef, useState } from "preact/hooks";
import { copy, shareImage, site } from "../lib/share";
import { drawCard } from "../lib/card";
import { summaryText, type Summary } from "../lib/summary";
import { loadBank, loadPref, saveBank, savePref } from "../lib/cache";
import { Reveal } from "../ui";
import { BankField } from "./Name";

/**
 * What goes into the shared result, remembered on the device. The screen
 * holds it so its own list opens and closes with the same boxes.
 */
export function useShareOpts() {
  const [withItems, setWithItems] = useState(() => loadPref<boolean>("withItems") === true);
  const [withBank, setWithBank] = useState(() => loadPref<boolean>("withBank") === true);
  const [bank, setBankRaw] = useState(loadBank);
  return {
    withItems,
    withBank,
    bank,
    /** What goes under the summary, or nothing. */
    pay: withBank && bank.trim() ? bank.trim() : undefined,
    toggleItems: () => { savePref("withItems", !withItems); setWithItems(!withItems); },
    toggleBank: () => { savePref("withBank", !withBank); setWithBank(!withBank); },
    setBank: (b: string) => { setBankRaw(b); saveBank(b); },
  };
}
export type ShareOpts = ReturnType<typeof useShareOpts>;

/** The bank details as the screen shows them, opening with the box. */
export function PayNote({ opts }: { opts: ShareOpts }) {
  return (
    <Reveal open={Boolean(opts.pay)}>
      <div class="pay-note">
        <span class="eyebrow">send your share to</span>
        <p>{opts.pay}</p>
      </div>
    </Reveal>
  );
}

/**
 * The end of every split: copy the result as text, or share it as a card.
 * The boxes drive both, and the screen above them.
 */
export function ShareBlock({
  make, opts, items = true, flash,
}: {
  /** The result, with or without each person's items. */
  make: (withItems: boolean) => Summary;
  opts: ShareOpts;
  /** Offer the items box at all (an equal split has no items). */
  items?: boolean;
  flash: (m: string) => void;
}) {
  const on = items && opts.withItems;
  const summary = { ...make(on), pay: opts.pay };
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

  const sendImage = async () => {
    const b = blob ?? (await drawCard(summary));
    const how = await shareImage(b, text, filename);
    if (how !== "failed") flash(how === "shared" ? "shared" : "image saved");
  };

  return (
    <div style={{ marginTop: 26 }}>
      <hr class="rule-dash" />
      {items ? <Check on={on} onChange={opts.toggleItems} label="with each person's items" /> : null}
      <Check on={opts.withBank} onChange={opts.toggleBank} label="with bank details" />
      <Reveal open={opts.withBank}>
        <BankField value={opts.bank} onInput={opts.setBank} style={{ marginBottom: 14 }} />
      </Reveal>
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

function Check({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <label class="check" style={{ display: "flex", marginBottom: 4 }}>
      <input type="checkbox" checked={on} onChange={onChange} />
      <span class="check-box" aria-hidden="true">
        {on ? <svg viewBox="0 0 24 24"><path d="M4.5 12.8 9.6 17.6 19.8 5.8" /></svg> : null}
      </span>
      <span>{label}</span>
    </label>
  );
}
