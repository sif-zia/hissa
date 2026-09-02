import { Sheet, Head, Amount } from "../ui";
import { fmt } from "../lib/money";
import { equalSplit } from "../lib/split";
import { tiltStyle } from "../lib/tilt";

/**
 * A local calculator. Never touches shared storage: no code, no names, no
 * network. Spec §2.5.
 */
export function EqualSplit({
  total, currency, heads, setHeads, onBack,
}: {
  total: number;
  currency: string;
  heads: number;
  setHeads: (n: number) => void;
  onBack: () => void;
}) {
  const { base, extra } = equalSplit(total, heads);

  return (
    <Sheet>
      <Head entry="entry no. 05" title="straight down the middle" onBack={onBack} />

      <div class="sticky" style={tiltStyle("eq", "page")}>
        <div class="row"><span class="dim">the bill</span><Amount value={fmt(total, currency, true)} /></div>
      </div>

      <div class="row" style={{ marginTop: 26, alignItems: "center" }}>
        <span class="eyebrow">how many of you</span>
        <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button class="tiny" onClick={() => setHeads(Math.max(1, heads - 1))} aria-label="One fewer person">−</button>
          <Amount value={String(heads)} size="md" />
          <button class="tiny" onClick={() => setHeads(Math.min(99, heads + 1))} aria-label="One more person">+</button>
        </span>
      </div>

      <hr class="rule-dash" />

      <div style={{ textAlign: "center", marginTop: 30 }}>
        <div class="eyebrow">each</div>
        <Amount value={fmt(base, currency, true)} size="lg" />
        {/* Say who pays the extra unit rather than silently rounding. §2.5 */}
        {extra > 0 ? (
          <p class="scrawl" style={{ color: "var(--rose)", marginTop: 10 }}>
            doesn't divide cleanly → {extra} {extra === 1 ? "person pays" : "people pay"}{" "}
            {fmt(base + 1, currency, true)}
          </p>
        ) : (
          <p class="scrawl dim" style={{ marginTop: 10 }}>divides perfectly. rare.</p>
        )}
      </div>
    </Sheet>
  );
}
