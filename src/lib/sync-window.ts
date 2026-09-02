/**
 * When a bill is still worth polling for, and how long to wait next.
 *
 * Pulled out of the hook so it can be tested without a DOM or fake timers:
 * getting this wrong either hammers a dead bill or silently stops updating a
 * live one, and neither is visible until someone is at a table.
 */

export const POLL_MS = 5_000;
export const LIVE_WINDOW_MS = 60 * 60 * 1000;
export const MAX_BACKOFF_MS = 60_000;

/** A bill polls for the first hour after it was opened. */
export const isLive = (openedAt: number, now: number): boolean =>
  now - openedAt < LIVE_WINDOW_MS;

export const msLeft = (openedAt: number, now: number): number =>
  Math.max(0, LIVE_WINDOW_MS - (now - openedAt));

/** Doubling backoff, capped, so a flaky connection stops making it worse. */
export const nextBackoff = (current: number): number =>
  Math.min(current ? current * 2 : POLL_MS, MAX_BACKOFF_MS);

export const waitFor = (backoff: number): number => backoff || POLL_MS;
