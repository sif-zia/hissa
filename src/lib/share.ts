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

/**
 * The result card, through the share sheet where the device can attach
 * files, downloaded everywhere else. The blob must already exist: iOS drops
 * the share sheet once the tap's user activation has expired, and waiting
 * on fonts and toBlob inside the tap can spend it.
 */
export async function shareImage(
  blob: Blob,
  text: string,
  filename: string,
): Promise<"shared" | "saved" | "failed"> {
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return "shared";
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "failed";
    }
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return "saved";
  } catch {
    return "failed";
  }
}

/** Where people can find this, for the footer of a shared result. */
export const site = (): string => {
  try {
    const { host, protocol } = window.location;
    if (protocol === "https:" || protocol === "http:") return host;
  } catch {
    // sandboxed
  }
  return "hissa.itisamzia.dev";
};

export const buzz = (ms = 10): void => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // unsupported, and not worth a branch anywhere else
  }
};
