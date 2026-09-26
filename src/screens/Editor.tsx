import { Sheet, Head, Amount } from "../ui";
import { useState } from "preact/hooks";
import {
  compute, fmt, outcomes, sentence, KINDS, MATCH_SLACK,
  type DraftBill, type DraftItem, type Kind,
} from "../lib/money";
import { uid } from "../lib/identity";
import { tiltStyle } from "../lib/tilt";

/**
 * The one dense screen, and it earns it. Same screen for the manual path and
 * the post-photo path; the only difference is whether the fields arrive
 * filled. Spec §2.4.
 */
export function Editor({
  bill, setBill, onEqual, onStart, onBack, suspect,
}: {
  bill: DraftBill;
  setBill: (b: DraftBill) => void;
  onEqual: () => void;
  onStart: () => void;
  onBack: () => void;
  suspect: boolean;
}) {
  const t = compute(bill);
  const cur = bill.currency;
  const money = (c: number) => fmt(c, cur, true);
  const [showService, setShowService] = useState(Boolean(bill.adj.service.val));
  const [picking, setPicking] = useState(false);
  const [more, setMore] = useState(false);
  const choices = outcomes(bill);
  const printed = bill.printedTotal;
  const anyMatch = [...choices.visible, ...choices.more].some((o) => o.matches);
  const pctOf = (k: Kind) => k === "gst" || bill.adj[k].mode === "pct";

  const patch = (over: Partial<DraftBill>) => setBill({ ...bill, ...over });
  const setItem = (id: string, over: Partial<DraftItem>) =>
    patch({ items: bill.items.map((i) => (i.id === id ? { ...i, ...over } : i)) });
  const addLine = () =>
    patch({ items: [...bill.items, { id: uid(), name: "", qty: "1", price: "" }] });
  const dropLine = (id: string) =>
    patch({ items: bill.items.filter((i) => i.id !== id) });

  return (
    <Sheet>
      <Head
        entry="entry no. 04"
        title="what's on it"
        note="fix anything that looks wrong. one wrong digit is a real argument later."
        onBack={onBack}
      />

      {suspect ? (
        <p class="sticky scrawl" style={{ "--tilt": "1.6deg", color: "var(--warn)", marginBottom: 18 }}>
          heads up → the lines don't add up to the subtotal printed on the bill. worth a check.
        </p>
      ) : null}

      <div class="row" style={{ marginBottom: 10 }}>
        <span class="eyebrow">the price column is</span>
        <span style={{ display: "flex", gap: 6 }}>
          <button
            class={bill.priceMode === "total" ? "tiny on" : "tiny"}
            onClick={() => patch({ priceMode: "total" })}
          >
            line total
          </button>
          <button
            class={bill.priceMode === "each" ? "tiny on" : "tiny"}
            onClick={() => patch({ priceMode: "each" })}
          >
            price each
          </button>
        </span>
      </div>

      <hr class="rule-dash" />

      <div class="lines">
        {bill.items.map((it) => (
          <div key={it.id} class="line-grid" style={{ marginBottom: 12 }}>
            <label>
              <span class="sr-only">Item name</span>
              <input
                class="write"
                placeholder="item"
                value={it.name}
                onInput={(e) => setItem(it.id, { name: (e.target as HTMLInputElement).value })}
              />
            </label>
            <label>
              <span class="sr-only">Quantity</span>
              <input
                class="write amt"
                inputMode="numeric"
                placeholder="1"
                value={it.qty}
                onInput={(e) => setItem(it.id, { qty: (e.target as HTMLInputElement).value })}
              />
            </label>
            <div style={{ display: "flex", alignItems: "end", gap: 4 }}>
              <label style={{ flex: 1 }}>
                <span class="sr-only">Price</span>
                <input
                  class="write amt"
                  inputMode="decimal"
                  placeholder="0"
                  value={it.price}
                  onInput={(e) => setItem(it.id, { price: (e.target as HTMLInputElement).value })}
                />
              </label>
              <button
                class="scratch"
                onClick={() => dropLine(it.id)}
                aria-label={`Remove ${it.name || "this line"}`}
                disabled={bill.items.length <= 1}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      <hr class="rule-dash" />

      <button class="tiny" onClick={addLine}>
        + another line
      </button>

      <hr class="rule-dash" style={{ marginTop: 22 }} />

      <div class="stack">
        {showService ? <ExtraRow kind="service" bill={bill} patch={patch} cur={cur} /> : null}
        <ExtraRow kind="gst" bill={bill} patch={patch} cur={cur} />
        <ExtraRow kind="discount" bill={bill} patch={patch} cur={cur} />
        <ExtraRow kind="tip" bill={bill} patch={patch} cur={cur} />
        {!showService ? (
          <button class="link" style={{ fontSize: "1.05em" }} onClick={() => setShowService(true)}>
            + service charge
          </button>
        ) : null}
      </div>

      {t.clamped ? (
        <p class="sticky scrawl" style={{ "--tilt": "-1.2deg", color: "var(--warn)", marginTop: 18 }}>
          heads up → the discount is bigger than the bill, so the total stops at zero.
        </p>
      ) : null}
      {printed && !anyMatch ? (
        <p class="sticky scrawl" style={{ "--tilt": "1.1deg", color: "var(--warn)", marginTop: 18 }}>
          heads up → the bill says {money(printed)} and no way of working out the extras gets there.
          check them.
        </p>
      ) : null}

      <hr class="rule-dash" />

      <div class="sticky" style={tiltStyle("totals", "page")}>
        <div class="row"><span class="dim">subtotal</span><Amount value={money(t.subtotal)} /></div>
        {KINDS.filter((k) => t.amts[k]).map((k) => (
          <div class="row" key={k}>
            <span class="dim">
              {LABEL[k]}
              {pctOf(k) ? ` ${bill.adj[k].val}%` : ""}
              {pctOf(k) && t.bases[k] !== t.subtotal ? (
                <> of <span class="amt">{fmt(t.bases[k], "", false).trim()}</span></>
              ) : null}
            </span>
            <Amount value={`${k === "discount" ? "−" : "+"}${money(t.amts[k])}`} />
          </div>
        ))}

        {choices.visible.length > 1 ? (
          <>
            <hr class="rule-dash" />
            <button
              class="link worked"
              onClick={() => setPicking(!picking)}
              aria-expanded={picking}
            >
              worked out: {sentence(t.steps, bill.adj)} {picking ? "▴" : "▾"}
            </button>
            {picking ? (
              <div role="radiogroup" aria-label="How the extras were worked out" style={{ marginTop: 8 }}>
                {[...choices.visible, ...(more ? choices.more : [])].map((o) => (
                  <button
                    key={o.total}
                    role="radio"
                    aria-checked={o.current}
                    class={o.current ? "pick on" : "pick"}
                    onClick={() => { patch({ steps: o.steps }); setPicking(false); setMore(false); }}
                  >
                    <span>{sentence(o.steps, bill.adj)}</span>
                    <span style={{ whiteSpace: "nowrap" }}>
                      <Amount value={money(o.total)} />
                      {o.matches ? <span class="scrawl" style={{ color: "var(--sage)" }}> ✓ bill</span> : null}
                    </span>
                  </button>
                ))}
                {choices.more.length && !more ? (
                  <button class="link" style={{ marginTop: 6 }} onClick={() => setMore(true)}>
                    more ways ({choices.more.length})
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        <hr class="rule-dash" />
        <div class="row" style={{ alignItems: "baseline" }}>
          <strong>total</strong>
          <Amount value={money(t.total)} size="md" />
        </div>
        {printed ? (
          <p class="scrawl dim small" style={{ margin: "4px 0 0", textAlign: "right" }}>
            the bill says <span class="amt">{money(printed)}</span>
            {Math.abs(t.total - printed) <= MATCH_SLACK ? <span style={{ color: "var(--sage)" }}> ✓</span> : null}
          </p>
        ) : null}
      </div>

      <div class="stack" style={{ marginTop: 22 }}>
        <button class="btn" style={tiltStyle("go-tap", "card")} onClick={onStart} disabled={!t.subtotal}>
          tap to split
        </button>
        <button class="btn btn-alt" onClick={onEqual} disabled={!t.subtotal}>
          split equally
        </button>
      </div>
    </Sheet>
  );
}

const LABEL: Record<Kind, string> = { service: "service", gst: "gst", discount: "discount", tip: "tip" };

/** One extra: its name, flat/% where that applies, and the value. */
function ExtraRow({
  kind, bill, patch, cur,
}: {
  kind: Kind;
  bill: DraftBill;
  patch: (over: Partial<DraftBill>) => void;
  cur: string;
}) {
  const a = bill.adj[kind];
  const set = (over: Partial<typeof a>) => patch({ adj: { ...bill.adj, [kind]: { ...a, ...over } } });
  return (
    <div class="row">
      <label class="eyebrow" for={`f-${kind}`}>{kind === "gst" ? "gst %" : LABEL[kind]}</label>
      <span style={{ display: "flex", gap: 6, alignItems: "end" }}>
        {kind !== "gst" ? (
          <>
            <button class={a.mode === "flat" ? "tiny on" : "tiny"} onClick={() => set({ mode: "flat" })}>
              {cur}
            </button>
            <button class={a.mode === "pct" ? "tiny on" : "tiny"} onClick={() => set({ mode: "pct" })}>
              %
            </button>
          </>
        ) : null}
        <input
          id={`f-${kind}`}
          class="write amt"
          inputMode="decimal"
          placeholder="0"
          style={{ width: "5.5rem" }}
          value={a.val}
          onInput={(e) => set({ val: (e.target as HTMLInputElement).value })}
        />
      </span>
    </div>
  );
}
