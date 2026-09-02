import { Sheet, Head, Amount } from "../ui";
import { compute, fmt, num, type DraftBill, type DraftItem } from "../lib/money";
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
        <div class="row">
          <label class="eyebrow" for="f-gst">gst %</label>
          <input
            id="f-gst"
            class="write amt"
            inputMode="decimal"
            placeholder="0"
            style={{ width: "5.5rem" }}
            value={bill.gst}
            onInput={(e) => patch({ gst: (e.target as HTMLInputElement).value })}
          />
        </div>

        {(["discount", "tip"] as const).map((field) => (
          <div class="row" key={field}>
            <label class="eyebrow" for={`f-${field}`}>{field}</label>
            <span style={{ display: "flex", gap: 6, alignItems: "end" }}>
              <button
                class={bill[field].mode === "flat" ? "tiny on" : "tiny"}
                onClick={() => patch({ [field]: { ...bill[field], mode: "flat" } } as Partial<DraftBill>)}
              >
                {cur}
              </button>
              <button
                class={bill[field].mode === "pct" ? "tiny on" : "tiny"}
                onClick={() => patch({ [field]: { ...bill[field], mode: "pct" } } as Partial<DraftBill>)}
              >
                %
              </button>
              <input
                id={`f-${field}`}
                class="write amt"
                inputMode="decimal"
                placeholder="0"
                style={{ width: "5.5rem" }}
                value={bill[field].val}
                onInput={(e) =>
                  patch({ [field]: { ...bill[field], val: (e.target as HTMLInputElement).value } } as Partial<DraftBill>)
                }
              />
            </span>
          </div>
        ))}
      </div>

      <hr class="rule-dash" />

      <div class="sticky" style={tiltStyle("totals", "page")}>
        <div class="row"><span class="dim">subtotal</span><Amount value={money(t.subtotal)} /></div>
        {num(bill.gst) ? (
          <div class="row"><span class="dim">gst {bill.gst}%</span><Amount value={money(t.gstAmt)} /></div>
        ) : null}
        {t.discountAmt ? (
          <div class="row"><span class="dim">discount</span><Amount value={`-${money(t.discountAmt)}`} /></div>
        ) : null}
        {t.tipAmt ? (
          <div class="row"><span class="dim">tip</span><Amount value={money(t.tipAmt)} /></div>
        ) : null}
        <hr class="rule-dash" />
        <div class="row" style={{ alignItems: "baseline" }}>
          <strong>total</strong>
          <Amount value={money(t.total)} size="md" />
        </div>
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
