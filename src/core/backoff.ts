const RETRY_BASE_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 8_000;

/** Exponential backoff with equal jitter (AWS taxonomy): uniform in [exp/2, exp), capped. */
export function backoffDelayMs(attempt: number): number {
  const exp = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** attempt);
  return exp / 2 + Math.random() * (exp / 2);
}

/**
 * Resolves after `ms`, or immediately when `signal` aborts — a caller
 * cancelling mid-backoff must not wait out the rest of a (up to 30s
 * Retry-After) sleep. The caller re-checks the signal after waking.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
