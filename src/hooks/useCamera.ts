import { useCallback, useEffect, useRef, useState } from "preact/hooks";

/**
 * A live viewfinder, not a file picker: framing matters because a bad crop
 * costs an extraction call and a round of confusion. Spec §2.2.
 */

export type CamState = "starting" | "live" | "denied" | "unavailable";

export function useCamera(active: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camState, setCamState] = useState<CamState>("starting");

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

  return { videoRef, camState, stop };
}
