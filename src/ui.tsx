import type { ComponentChildren, JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { tiltStyle } from "./lib/tilt";
import { applyTheme, loadTheme, nextTheme, themeName, type Theme } from "./lib/theme";

/** Shared stationery. Every screen builds from these, never from raw CSS. */

export function Sheet({ children }: { children: ComponentChildren }) {
  return (
    <div class="paper">
      <div class="sheet">
        <ThemeToggle />
        {children}
      </div>
    </div>
  );
}

/**
 * One small control, cycling light → dark → follow-system. Deliberately not a
 * settings screen: Hissa has six screens and a code, and anything that cannot
 * justify itself against "fewest steps to a number" does not ship.
 */
function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(loadTheme);
  useEffect(() => { applyTheme(theme); }, [theme]);
  const name = themeName(theme);
  return (
    <button
      class="theme-toggle"
      onClick={() => setTheme(nextTheme(theme))}
      title={`Theme: ${name}`}
      aria-label={`Theme: ${name}. Tap to change.`}
    >
      <ThemeIcon theme={theme} />
    </button>
  );
}

/*
 * Drawn rather than typed. The ☀ glyph renders differently on every platform
 * and collapses to a filled dot at this size, and emoji sit badly in a
 * handwritten page anyway.
 */
function ThemeIcon({ theme }: { theme: Theme }) {
  const common = {
    width: 17, height: 17, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", "stroke-width": 2.1,
    "stroke-linecap": "round" as const, "stroke-linejoin": "round" as const,
    "aria-hidden": true,
  };
  if (theme === "dark") {
    return (
      <svg {...common}>
        <path d="M20 14.5A8.2 8.2 0 0 1 9.5 4 8.4 8.4 0 1 0 20 14.5Z" />
      </svg>
    );
  }
  if (theme === "system") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="4.4" />
      <path d="M12 1.8v2.6M12 19.6v2.6M22.2 12h-2.6M4.4 12H1.8M19.2 4.8l-1.9 1.9M6.7 17.3l-1.9 1.9M19.2 19.2l-1.9-1.9M6.7 6.7 4.8 4.8" />
    </svg>
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
        {/* Non-scaling stroke: preserveAspectRatio="none" squashes the
            viewBox horizontally, which would otherwise thin the line to a
            hairline on a short word. */}
        <path
          d="M2 8 C 40 3, 70 10, 104 6 S 168 3, 198 7"
          vector-effect="non-scaling-stroke"
          style={{ "--len": 210 }}
        />
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
