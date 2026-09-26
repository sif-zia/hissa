/**
 * The device's last known standing on photo reads, kept so "take a pic" can
 * answer instantly and check with the server in the background. Only ever
 * advice: the server counts, and refuses, regardless of what is stored here.
 */

import type { Usage } from "./api";
import { loadPref, savePref } from "./cache";

export const loadUsage = (): Usage | null => loadPref<Usage>("usage");
export const saveUsage = (u: Usage | null | undefined): void => {
  if (u) savePref("usage", u);
};

/**
 * Stored as blocked, or the last read used the final one, and the window
 * hasn't reset yet. "allowed" on a read's answer means *that* read went
 * through; with nothing remaining the next one won't.
 */
export const blockedLocally = (u: Usage | null, now = Date.now()): boolean =>
  Boolean(u && (!u.allowed || u.remaining <= 0) && now < u.resetAt);

/** "in about 5 hours", "in under an hour". */
export function againIn(resetAt: number, now = Date.now()): string {
  const h = Math.ceil((resetAt - now) / 3_600_000);
  return h <= 1 ? "in under an hour" : `in about ${h} hours`;
}

/** Said under "take a pic", and on the photo when a read is refused. */
export function limitMessage(u: Usage, now = Date.now()): string {
  const when = againIn(u.resetAt, now);
  const why = "reading a photo costs us money, so we have to put a limit on it. we hope you understand.";
  if (u.reason === "global") {
    return `hissa has read as many bills as it can for today. sorry for the inconvenience → ${why} photos open up again ${when}.`;
  }
  if (u.reason === "network") {
    return `a lot of bills have been read from this network today, and it has reached its limit. sorry for the inconvenience → ${why} you can read more ${when}.`;
  }
  return `you've reached the daily limit of ${u.limit} bills. sorry for the inconvenience → ${why} you can read another ${when}.`;
}
