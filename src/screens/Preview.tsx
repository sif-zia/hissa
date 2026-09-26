import { Sheet, Head } from "../ui";
import type { Shot } from "../lib/image";
import { tiltStyle } from "../lib/tilt";

/**
 * Extraction runs on Next, not on capture, so a bad frame costs nothing.
 * Spec §2.3.
 */
export function Preview({
  shot, reading, onNext, onRetake, onManual, error,
}: {
  onManual: () => void;
  shot: Shot;
  reading: boolean;
  onNext: () => void;
  onRetake: () => void;
  error: string;
}) {
  return (
    <Sheet>
      <Head
        entry="entry no. 03"
        title="is it readable?"
        note="every line and the totals should be in frame."
        error={error}
      />

      <figure class="sticky dogear" style={{ ...tiltStyle("prev", "note"), margin: 0, padding: 10 }}>
        <img src={shot.preview} alt="The bill you photographed" style={{ display: "block", width: "100%" }} />
        <figcaption class="scrawl dim small" style={{ marginTop: 8 }}>
          pasted in from the camera roll
        </figcaption>
      </figure>

      <div class="stack" style={{ marginTop: 26 }}>
        <button class="btn" style={tiltStyle("go-next", "card")} onClick={onNext} disabled={reading}>
          {reading ? "reading it…" : "read it"}
        </button>
        {error ? (
          <button class="btn btn-alt" onClick={onManual} disabled={reading}>
            enter it manually
          </button>
        ) : (
          <button class="btn btn-alt" onClick={onRetake} disabled={reading}>
            retake
          </button>
        )}
      </div>
    </Sheet>
  );
}
