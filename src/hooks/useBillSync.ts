import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { fetchBill, ApiError } from "../lib/api";
import { loadBill, saveBill, type BillState } from "../lib/cache";

/**
 * Live-ish state for one bill.
 *
 * Polls every 5s for the first hour after the code was created — the window in
 * which a table is actually settling up — then stops and waits for Refresh.
 * Every request is ETag-gated, so a quiet poll costs a 304 with no body.
 * Paints from the local cache first so a reload shows the last known numbers
 * immediately instead of a spinner.
 */

const POLL_MS = 5_000;
const LIVE_WINDOW_MS = 60 * 60 * 1000;
const MAX_BACKOFF_MS = 60_000;

export interface Sync {
  state: BillState | null;
  /** True while showing cached numbers that have not been confirmed yet. */
  stale: boolean;
  error: string;
  live: boolean;
  refreshing: boolean;
  refresh: () => void;
  /** Apply an optimistic local change without waiting for the next poll. */
  patch: (next: BillState) => void;
}

export function useBillSync(code: string | null): Sync {
  const [state, setState] = useState<BillState | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [live, setLive] = useState(true);

  const etag = useRef<string | undefined>(undefined);
  const backoff = useRef(0);
  const inFlight = useRef(false);

  // Paint the cached copy before the network is even touched.
  useEffect(() => {
    if (!code) return;
    const cached = loadBill(code);
    if (cached) {
      setState(cached.state);
      etag.current = cached.etag;
      setStale(true);
    }
  }, [code]);

  const pull = useCallback(
    async (manual: boolean) => {
      if (!code || inFlight.current) return;
      inFlight.current = true;
      if (manual) setRefreshing(true);
      try {
        const res = await fetchBill(code, etag.current);
        if (res.changed) {
          etag.current = res.etag;
          setState(res.state);
          saveBill(code, res.etag, res.state);
        }
        setStale(false);
        setError("");
        backoff.current = 0;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          setError(`No split found with code ${code}.`);
          backoff.current = MAX_BACKOFF_MS; // stop hammering a bill that is gone
        } else {
          setError("Lost touch with the split. It will retry.");
          backoff.current = Math.min(backoff.current ? backoff.current * 2 : POLL_MS, MAX_BACKOFF_MS);
        }
      } finally {
        inFlight.current = false;
        setRefreshing(false);
      }
    },
    [code],
  );

  // First landing on the split screen always fetches.
  useEffect(() => {
    if (code) void pull(false);
  }, [code, pull]);

  useEffect(() => {
    if (!code || !state) return undefined;

    const elapsed = Date.now() - state.meta.at;
    if (elapsed >= LIVE_WINDOW_MS) {
      setLive(false);
      return undefined;
    }
    setLive(true);

    let timer = 0;
    const tick = () => {
      // A backgrounded tab is not a table settling up; skip and wait.
      if (document.visibilityState === "visible") void pull(false);
      const wait = backoff.current || POLL_MS;
      timer = window.setTimeout(tick, wait);
    };
    timer = window.setTimeout(tick, backoff.current || POLL_MS);

    // Stop polling once the live window closes, without waiting for a render.
    const stop = window.setTimeout(() => setLive(false), LIVE_WINDOW_MS - elapsed);
    return () => {
      clearTimeout(timer);
      clearTimeout(stop);
    };
  }, [code, state, pull]);

  // Coming back to the tab is a good moment to catch up, live window or not.
  useEffect(() => {
    if (!code) return undefined;
    const onShow = () => {
      if (document.visibilityState === "visible") void pull(false);
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [code, pull]);

  const patch = useCallback(
    (next: BillState) => {
      setState(next);
      if (code && etag.current) saveBill(code, etag.current, next);
    },
    [code],
  );

  return { state, stale, error, live, refreshing, refresh: () => void pull(true), patch };
}
