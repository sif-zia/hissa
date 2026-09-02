import type { ComponentChildren, JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { tiltStyle } from "./lib/tilt";

/** Shared stationery. Every screen builds from these, never from raw CSS. */

export function Sheet({ children }: { children: ComponentChildren }) {
  return (
    <div class="paper">
      <div class="sheet">{children}</div>
    </div>
  );
}

export function Head({
  title, note, onBack, error, entry,
}: {
  title: string;
  note?: string;
  onBack?: () => void;
  error?: string;
  entry?: string;
}) {
  return (
    <header style={{ marginBottom: 22 }}>
      {onBack ? (
        <button class="link" onClick={onBack} style={{ marginBottom: 10 }}>
          ← back
        </button>
      ) : null}
      {entry ? <div class="eyebrow">{entry}</div> : null}
      <h1 style={tiltStyle(`h-${title}`, "page")} class="tilt">
        {title}
      </h1>
      {note ? <p class="scrawl dim" style={{ margin: 0 }}>{note}</p> : null}
      {error ? (
        <p class="scrawl" role="alert" style={{ color: "var(--warn)", margin: "10px 0 0" }}>
          {error}
        </p>
      ) : null}
    </header>
  );
}

/** A hand-drawn underline that draws itself in when scrolled to. */
export function Underline({ children }: { children: ComponentChildren }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          el.classList.add("drawn");
          io.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <span class="underline-draw" ref={ref}>
      {children}
      <svg viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
        <path d="M2 8 C 40 3, 70 10, 104 6 S 168 3, 198 7" style={{ "--len": 210 }} />
      </svg>
    </span>
  );
}

export function Amount({
  value, size = "sm", dim, class: cls = "",
}: {
  value: string;
  size?: "sm" | "md" | "lg";
  dim?: boolean;
  class?: string;
}) {
  const s = size === "lg" ? " amt-lg" : size === "md" ? " amt-md" : "";
  return <span class={`amt${s}${dim ? " amt-dim" : ""} ${cls}`}>{value}</span>;
}

export function Toast({ message }: { message: string }) {
  return message ? (
    <div class="toast" role="status" aria-live="polite">
      {message}
    </div>
  ) : null;
}

/** A labelled input written on a ruled line rather than boxed. */
export function Write(
  props: JSX.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string },
) {
  const { label, hint, class: cls = "", ...rest } = props;
  const id = `f-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <label for={id} style={{ display: "block" }}>
      <span class="eyebrow">{label}</span>
      <input id={id} class={`write ${cls}`} {...rest} />
      {hint ? <span class="small dim">{hint}</span> : null}
    </label>
  );
}
