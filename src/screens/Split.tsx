import { Sheet, Head, Amount } from "../ui";
import { fmt } from "../lib/money";
import { spread, shareOf, type BillMeta, type Claims, type Person } from "../lib/split";
import { paletteFor, type Identity } from "../lib/identity";
import { ItemList } from "./ItemList";

/**
 * Tap to claim. Whole-row targets, claimer chips, live per-person totals, and
 * your own number pinned to the bottom so it never needs scrolling. Spec §2.7.
 */
export function Split({
  meta, people, me, mine, onTap, onBump, onToggleLeftovers, onCopyLink, onCopyCode, onRefresh,
  live, refreshing, stale, error, onBack, onChangeName,
}: {
  meta: BillMeta;
  people: Person[];
  me: Identity;
  mine: Claims;
  onTap: (lineId: string) => void;
  onBump: (lineId: string, delta: number) => void;
  onToggleLeftovers: () => void;
  onCopyLink: () => void;
  onCopyCode: () => void;
  onRefresh: () => void;
  live: boolean;
  refreshing: boolean;
  stale: boolean;
  error: string;
  onBack: () => void;
  onChangeName: () => void;
}) {
  const cur = meta.currency;
  const money = (c: number) => fmt(c, cur, true);

  // My own claims come from local optimistic state, everyone else's from the
  // last poll, so a tap never waits on the network.
  const everyone: Person[] = [
    { key: me.key, name: me.name, claims: mine },
    ...people.filter((p) => p.key !== me.key),
  ];

  const { subShare, loose, byLine } = spread(meta, everyone);
  // Built from every key on the bill, so it is identical on every device.
  const palette = paletteFor(everyone.map((p) => p.key));
  const myTotal = shareOf(meta, subShare[me.key] ?? 0);
  const looseTotal = shareOf(meta, loose);

  return (
    <Sheet>
      <div class="row" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <Head entry={`code ${meta.code}`} title={meta.billName} onBack={onBack} error={error} />
        </div>
      </div>

      <p style={{ marginBottom: 18 }}>
        Copy{" "}
        <button class="cta" onClick={onCopyLink}>link</button>
        {" "}or{" "}
        <button class="cta" onClick={onCopyCode} aria-label={`Copy the code, ${meta.code}`}>code</button>
        {stale ? <span class="scrawl dim" style={{ marginLeft: 10 }}>catching up…</span> : null}
      </p>

      {/* The item list is a block on the bill: ruled off top and bottom. */}
      <hr class="rule-dash" />

      <ItemList
        lines={meta.lines}
        byLine={byLine}
        mine={mine}
        activeKey={me.key}
        palette={palette}
        onTap={onTap}
        onBump={onBump}
        money={money}
      />

      <hr class="rule-dash" />

      <div class="row" style={{ alignItems: "center" }}>
        <span>
          <span class="dim">nobody's claimed </span>
          <Amount value={money(looseTotal)} dim={loose === 0} />
        </span>
        <button
          class={meta.splitUnclaimed ? "tiny on" : "tiny"}
          onClick={onToggleLeftovers}
          aria-pressed={meta.splitUnclaimed}
        >
          {meta.splitUnclaimed ? "sharing leftovers" : "share leftovers"}
        </button>
      </div>

      <hr class="rule-dash" />

      <h2 style={{ fontSize: "var(--step-1)", marginTop: 22 }}>who owes what</h2>
      <div>
        {everyone.map((p) => (
          <div class="row" key={p.key} style={{ padding: "7px 0", borderBottom: "1.5px dashed var(--ink-line)" }}>
            <span>
              <span
                aria-hidden="true"
                style={{
                  display: "inline-block", width: 9, height: 9, borderRadius: "50%",
                  background: palette[p.key], marginRight: 8,
                }}
              />
              {p.name}
              {p.key === me.key ? (
                <>
                  <span class="scrawl" style={{ color: "var(--rose)" }}> ← you</span>
                  <button
                    class="link"
                    style={{ fontSize: "0.95rem", marginLeft: 10 }}
                    onClick={onChangeName}
                  >
                    not {me.name}?
                  </button>
                </>
              ) : null}
            </span>
            <Amount value={money(shareOf(meta, subShare[p.key] ?? 0))} dim={p.key !== me.key} />
          </div>
        ))}
      </div>

      <p class="scrawl dim small" style={{ marginTop: 20 }}>
        {live
          ? "fyi → other people's taps land within about five seconds."
          : "this split has been open a while → hit refresh to pull in anything new."}
      </p>

      <div class="bar">
        <div class="bar-in">
          <span>
            <div class="eyebrow" style={{ color: "inherit", opacity: 0.65 }}>your hissa</div>
            <Amount value={money(myTotal)} size="md" />
          </span>
          <button class="ghost" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? "…" : "refresh"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
