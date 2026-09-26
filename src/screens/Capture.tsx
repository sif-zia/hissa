import { useEffect, useRef, useState } from "preact/hooks";
import { Sheet, Head } from "../ui";
import { useCamera } from "../hooks/useCamera";
import { grab, shrink, frameCoords, type Shot } from "../lib/image";
import { buzz } from "../lib/share";

/**
 * Live viewfinder, full screen like a camera app, drawn in the journal's
 * hand. The file input is a fallback, never the primary path. Focus and
 * flash appear only where the camera says it can do them.
 */
export function Capture({
  onShot, onBack, error, setError,
}: {
  onShot: (s: Shot) => void;
  onBack: () => void;
  error: string;
  setError: (e: string) => void;
}) {
  const { videoRef, camState, stop, caps, focusAt, setTorch } = useCamera(true);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [torch, setTorchOn] = useState(false);
  const [ring, setRing] = useState<{ x: number; y: number; n: number } | null>(null);

  const blocked = camState === "denied" || camState === "unavailable";

  // A camera app doesn't scroll.
  useEffect(() => {
    if (blocked) return undefined;
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = was; };
  }, [blocked]);

  useEffect(() => {
    if (!ring) return undefined;
    const t = setTimeout(() => setRing(null), 700);
    return () => clearTimeout(t);
  }, [ring]);

  const tapFocus = (e: PointerEvent) => {
    const v = videoRef.current;
    if (!v) return;
    const r = v.getBoundingClientRect();
    setRing({ x: e.clientX - r.left, y: e.clientY - r.top, n: (ring?.n ?? 0) + 1 });
    if (v.videoWidth) {
      const p = frameCoords({ x: e.clientX, y: e.clientY }, r, v.videoWidth, v.videoHeight);
      focusAt(p.x, p.y);
    }
  };

  const flip = () => {
    const on = !torch;
    setTorchOn(on);
    void setTorch(on);
  };

  const snap = () => {
    if (!videoRef.current) return;
    try {
      const shot = grab(videoRef.current);
      buzz(12);
      stop();
      onShot(shot);
    } catch {
      setError("Could not capture that frame. Hold steady and try again.");
    }
  };

  const pick = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      stop();
      onShot(await shrink(file));
    } catch {
      setError("Could not open that photo. Try another one.");
    }
  };

  const picker = (
    <input
      ref={fileRef}
      type="file"
      accept="image/*"
      capture="environment"
      onChange={pick}
      class="sr-only"
    />
  );

  if (!blocked) {
    return (
      <div class="cam">
        <video
          ref={videoRef}
          class="cam-video"
          playsInline
          muted
          autoPlay
          aria-label="Camera viewfinder. Tap to focus."
          onPointerDown={tapFocus}
        />

        {/* Pencil corner marks: where the bill goes. */}
        <svg class="cam-frame" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M1 12 C1 6 2 2 9 1.5 M91 1.5 C98 2 99 6 99 12 M99 88 C99 94 98 98 91 98.5 M9 98.5 C2 98 1 94 1 88" />
        </svg>

        <p class="sticky tape scrawl cam-note" style={{ "--tilt": "-1.6deg" }}>
          fit the whole bill,<br />top to bottom
        </p>

        {ring ? (
          <svg
            key={ring.n}
            class="cam-ring"
            style={{ left: ring.x, top: ring.y }}
            viewBox="0 0 60 60"
            aria-hidden="true"
          >
            <path d="M30 6 C44 5 55 16 54 30 C53 45 42 55 29 54 C15 53 6 43 6 30 C6 17 16 8 33 7" />
          </svg>
        ) : null}

        {camState === "starting" ? <p class="scrawl cam-wait">waking the camera…</p> : null}

        <div class="cam-top">
          <button class="stub cam-btn" onClick={() => { stop(); onBack(); }} aria-label="Close the camera">
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 5.5 18.5 19M18.8 4.8 5.2 18.6" />
            </svg>
          </button>
          {caps.torch ? (
            <button
              class={torch ? "stub cam-btn on" : "stub cam-btn"}
              onClick={flip}
              aria-pressed={torch}
              aria-label="Flash"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M13.5 2.5 5.5 13.2h6l-1.6 8.3 8.4-11.2h-6.1z" />
              </svg>
              <span>flash</span>
            </button>
          ) : null}
        </div>

        {error ? <p class="sticky scrawl cam-err" role="alert">{error}</p> : null}

        <div class="cam-bottom">
          <button class="stub cam-btn" onClick={() => fileRef.current?.click()}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 15.5V4.2M7.4 8.6 12 4l4.6 4.6M4.6 14.8v5h14.8v-5" />
            </svg>
            <span>upload</span>
          </button>
          <button class="shutter" onClick={snap} disabled={camState !== "live"} aria-label="Take the photo" />
          <span aria-hidden="true" />
        </div>
        {picker}
      </div>
    );
  }

  return (
    <Sheet>
      <Head
        entry="entry no. 02"
        title="point at the bill"
        note="fill the frame, top to bottom."
        onBack={() => { stop(); onBack(); }}
        error={error}
      />

      <div class="sticky" style={{ "--tilt": "-1.2deg" }}>
        <p style={{ margin: 0 }}>
          {camState === "denied"
            ? "the camera said no. that's fine — your phone's own camera works just as well."
            : "no live camera here. your phone's own camera works just as well."}
        </p>
        <p class="small dim" style={{ margin: "8px 0 0" }}>
          {camState === "denied"
            ? "why → hissa needs camera permission, and it was declined for this site."
            : "why → a live viewfinder needs https and a real camera."}
        </p>
      </div>

      <div style={{ marginTop: 26, display: "grid", placeItems: "center", gap: 14 }}>
        <button
          class="btn btn-alt"
          style={{ maxWidth: 280 }}
          onClick={() => fileRef.current?.click()}
        >
          open my camera
        </button>
        {picker}
      </div>
    </Sheet>
  );
}
