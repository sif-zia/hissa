/**
 * Light by default, whatever the OS says. Dark is a deliberate choice, kept on
 * this device — spec §8 wants dark available for restaurants at night, not
 * imposed on someone splitting a lunch bill at a desk.
 */

export type Theme = "light" | "dark" | "system";

const KEY = "hissa:theme";
export const THEMES: Theme[] = ["light", "dark", "system"];

export function loadTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dark" || v === "system" ? v : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(t: Theme): void {
  document.documentElement.setAttribute("data-theme", t);
  try {
    localStorage.setItem(KEY, t);
  } catch {
    // Blocked storage: the theme still applies for this page view.
  }
}

export const nextTheme = (t: Theme): Theme =>
  THEMES[(THEMES.indexOf(t) + 1) % THEMES.length] as Theme;

export const themeName = (t: Theme): string =>
  t === "system" ? "following your system" : t;
