import { describe, expect, it } from "vitest";
import { ConnectionError, EntryBit, TimeoutError, UserAbortError } from "../src/index.js";
import { mockFetch } from "./helpers.js";

const OK_PAGE = { success: true, items: [], has_more: false };

// These specs use real timers with millisecond-scale timeouts:
// `AbortSignal.timeout` runs on native timers that fake timers cannot advance.
describe("timeouts and cancellation", () => {
  it("aborts a hanging request after timeoutMs and throws TimeoutError", async () => {
    const { fn, spy } = mockFetch({ hang: true });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn, timeoutMs: 20, maxRetries: 0 });
    const err = await eb.passes.list().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TimeoutError);
    expect(err).toBeInstanceOf(ConnectionError); // legacy handling still catches it
    expect((err as TimeoutError).message).toContain("timed out after 20 ms");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("retries an idempotent GET after a timeout", async () => {
    const { fn, spy } = mockFetch({ hang: true }, { body: OK_PAGE });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn, timeoutMs: 20, maxRetries: 1 });
    const page = await eb.passes.list();
    expect(page.has_more).toBe(false);
    expect(spy).toHaveBeenCalledTimes(2);
  }, 15_000);

  it("honors a per-request timeoutMs override", async () => {
    const { fn } = mockFetch({ hang: true });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn, maxRetries: 0 });
    const started = Date.now();
    const err = await eb.passes.list(undefined, { timeoutMs: 20 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TimeoutError);
    expect(Date.now() - started).toBeLessThan(5_000); // not the 30s default
  });

  it("maps a caller abort to UserAbortError and never retries it", async () => {
    const { fn, spy } = mockFetch({ hang: true });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn, maxRetries: 2 });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);
    const err = await eb.passes.list(undefined, { signal: controller.signal }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UserAbortError);
    expect(err).not.toBeInstanceOf(ConnectionError);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("respects an already-aborted signal without issuing any request at all", async () => {
    const { fn, spy } = mockFetch({ hang: true });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn, maxRetries: 2 });
    const controller = new AbortController();
    controller.abort();
    const err = await eb.passes.list(undefined, { signal: controller.signal }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UserAbortError);
    expect(spy).not.toHaveBeenCalled();
  });

  it("combines a user signal with the timeout: the timeout still fires with a live user signal attached", async () => {
    const { fn } = mockFetch({ hang: true });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn, maxRetries: 0 });
    const controller = new AbortController(); // never aborted
    const err = await eb.passes
      .list(undefined, { signal: controller.signal, timeoutMs: 20 })
      .catch((e: unknown) => e);
    // Only AbortSignal.any (both sources) makes the timeout reach the hung
    // fetch while a user signal is present.
    expect(err).toBeInstanceOf(TimeoutError);
  });
});
