import { useCallback, useEffect, useRef, useState } from "preact/hooks";

/**
 * A live viewfinder, not a file picker: framing matters because a bad crop
 * costs an extraction call and a round of confusion. Spec §2.2.
 */

export type CamState = "starting" | "live" | "denied" | "unavailable";

/** What this camera can be asked to do. Controls exist only for true ones. */
export interface Caps { focus: boolean; torch: boolean }

/* Image-capture constraints are real (Chrome Android) but absent from the
   DOM typings. */
type Extra = { torch?: boolean; focusMode?: string; pointsOfInterest?: { x: number; y: number }[] };
const ask = (t: MediaStreamTrack | undefined, c: Extra) =>
  t?.applyConstraints({ advanced: [c as MediaTrackConstraintSet] }).catch(() => undefined);

export function useCamera(active: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camState, setCamState] = useState<CamState>("starting");
  const [caps, setCaps] = useState<Caps>({ focus: false, torch: false });
  const refocus = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const track = () => streamRef.current?.getVideoTracks()[0];

  /** A rear camera left running drains the battery and keeps the OS privacy
   *  indicator lit, so every exit path goes through here. */
  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    let dead = false;
    setCamState("starting");

    void (async () => {
      // getUserMedia needs a secure context; absent inside sandboxed previews.
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamState("unavailable");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1440 },
          },
          audio: false,
        });
        if (dead) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch {
            // autoplay guard; the stream is attached either way
          }
        }
        setCamState("live");

        // Some Android cameras fill their capabilities in late: read twice.
        const read = () => {
          if (dead) return;
          const c = (track()?.getCapabilities?.() ?? {}) as { torch?: boolean; focusMode?: string[] };
          setCaps({
            focus: Array.isArray(c.focusMode) && c.focusMode.includes("single-shot"),
            torch: c.torch === true,
          });
        };
        read();
        setTimeout(read, 500);
      } catch (e) {
        setCamState(e instanceof Error && e.name === "NotAllowedError" ? "denied" : "unavailable");
      }
    })();

    return () => {
      dead = true;
      stop();
    };
  }, [active, stop]);

  // Belt and braces: also stop on unmount, whatever `active` was doing.
  useEffect(() => stop, [stop]);

  /** Refocus on a point of the frame (0-1), then hand back to autofocus. */
  const focusAt = useCallback((x: number, y: number) => {
    if (!caps.focus) return;
    void ask(track(), { pointsOfInterest: [{ x, y }], focusMode: "single-shot" });
    clearTimeout(refocus.current);
    refocus.current = setTimeout(() => void ask(track(), { focusMode: "continuous" }), 3000);
  }, [caps.focus]);

  const setTorch = useCallback((on: boolean) => ask(track(), { torch: on }), []);

  useEffect(() => () => clearTimeout(refocus.current), []);

  return { videoRef, camState, stop, caps, focusAt, setTorch };
}
