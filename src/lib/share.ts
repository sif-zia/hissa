/** Invite sharing. Falls back through Web Share, clipboard, then plain text. */

export const linkFor = (code: string): string => {
  try {
    const { origin, protocol } = window.location;
    if (protocol === "http:" || protocol === "https:") return `${origin}/s/${code}`;
  } catch {
    // sandboxed
  }
  return `Join my split, code ${code}`;
};

export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API needs a secure context and a user gesture; fall back.
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Native share sheet where there is one, clipboard everywhere else. */
export async function share(code: string, billName: string): Promise<"shared" | "copied" | "failed"> {
  const url = linkFor(code);
  if (navigator.share) {
    try {
      await navigator.share({ title: `Hissa — ${billName}`, text: `Split "${billName}" with me. Code ${code}.`, url });
      return "shared";
    } catch (e) {
      // AbortError means the user dismissed the sheet — don't then copy behind
      // their back, just report nothing happened.
      if (e instanceof Error && e.name === "AbortError") return "failed";
    }
  }
  return (await copy(url)) ? "copied" : "failed";
}

export const buzz = (ms = 10): void => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // unsupported, and not worth a branch anywhere else
  }
};
