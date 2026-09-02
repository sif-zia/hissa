import { useRef } from "preact/hooks";
import { Sheet, Head } from "../ui";
import { useCamera } from "../hooks/useCamera";
import { grab, shrink, type Shot } from "../lib/image";
import { buzz } from "../lib/share";

/** Live viewfinder. The file input is a fallback, never the primary path. */
export function Capture({
  onShot, onBack, error, setError,
}: {
  onShot: (s: Shot) => void;
  onBack: () => void;
  error: string;
  setError: (e: string) => void;
}) {
  const { videoRef, camState, stop } = useCamera(true);
  const fileRef = useRef<HTMLInputElement | null>(null);

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

  const blocked = camState === "denied" || camState === "unavailable";

  return (
    <Sheet>
      <Head
        entry="entry no. 02"
        title="point at the bill"
        note="fill the frame, top to bottom."
        onBack={() => { stop(); onBack(); }}
        error={error}
      />

      {blocked ? (
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
      ) : (
        <div style={{ position: "relative" }}>
          <video
            ref={videoRef}
            class="view"
            playsInline
            muted
            autoPlay
            aria-label="Camera viewfinder"
          />
          {camState === "starting" ? (
            <p class="scrawl dim" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", margin: 0 }}>
              waking the camera…
            </p>
          ) : null}
        </div>
      )}

      <div style={{ marginTop: 26, display: "grid", placeItems: "center", gap: 14 }}>
        {!blocked ? (
          <button class="shutter" onClick={snap} disabled={camState !== "live"} aria-label="Take the photo" />
        ) : null}
        <button
          class="btn btn-alt"
          style={{ maxWidth: 280 }}
          onClick={() => fileRef.current?.click()}
        >
          {blocked ? "open my camera" : "upload a photo instead"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={pick}
          class="sr-only"
        />
      </div>
    </Sheet>
  );
}
