import { describe, it, expect } from "vitest";
import { isLive, msLeft, nextBackoff, waitFor, POLL_MS, LIVE_WINDOW_MS, MAX_BACKOFF_MS } from "../src/lib/sync-window";

const MIN = 60_000;

describe("live window", () => {
  const opened = 1_000_000;

  it("polls a fresh bill", () => expect(isLive(opened, opened)).toBe(true));
  it("still polls at 59 minutes", () => expect(isLive(opened, opened + 59 * MIN)).toBe(true));
  it("stops at exactly one hour", () => expect(isLive(opened, opened + 60 * MIN)).toBe(false));
  it("stops well after", () => expect(isLive(opened, opened + 5 * 60 * MIN)).toBe(false));

  it("survives a client clock behind the server's without polling forever", () => {
    // The server stamps `at`; a client clock skewed early makes elapsed
    // negative. That must read as live, not as a negative timeout.
    expect(isLive(opened, opened - 10 * MIN)).toBe(true);
    expect(msLeft(opened, opened - 10 * MIN)).toBeGreaterThan(0);
  });

  it("never returns a negative delay", () => {
    expect(msLeft(opened, opened + 999 * MIN)).toBe(0);
  });

  it("counts down toward the hour", () => {
    expect(msLeft(opened, opened + 30 * MIN)).toBe(30 * MIN);
    expect(msLeft(opened, opened)).toBe(LIVE_WINDOW_MS);
  });
});

describe("backoff", () => {
  it("starts at the poll interval", () => expect(nextBackoff(0)).toBe(POLL_MS));
  it("doubles", () => expect(nextBackoff(POLL_MS)).toBe(POLL_MS * 2));
  it("caps, so a flaky connection cannot make it worse forever", () => {
    let b = 0;
    for (let i = 0; i < 30; i += 1) b = nextBackoff(b);
    expect(b).toBe(MAX_BACKOFF_MS);
  });
  it("uses the plain interval when healthy", () => {
    expect(waitFor(0)).toBe(POLL_MS);
    expect(waitFor(20_000)).toBe(20_000);
  });
});
