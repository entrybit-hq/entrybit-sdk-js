import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APIError, EntryBit, RateLimitError } from "../src/index.js";
import { mockFetch } from "./helpers.js";

const OK_PAGE = { success: true, items: [], has_more: false };

describe("retry with backoff", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries a GET on 429 and honors Retry-After (delta-seconds)", async () => {
    const { fn, spy } = mockFetch(
      { status: 429, body: {}, headers: { "Retry-After": "3" } },
      { body: OK_PAGE },
    );
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    const promise = eb.org.members.list();
    // Attach a handler immediately so a rejection is never unhandled.
    const settled = promise.then(
      (v) => ({ ok: true as const, v }),
      (e) => ({ ok: false as const, e }),
    );

    await vi.advanceTimersByTimeAsync(2_999);
    expect(spy).toHaveBeenCalledTimes(1); // still waiting out Retry-After

    await vi.advanceTimersByTimeAsync(1);
    expect(spy).toHaveBeenCalledTimes(2);

    const result = await settled;
    expect(result.ok).toBe(true);
  });

  it("caps an absurdly large Retry-After at 30 seconds", async () => {
    const { fn, spy } = mockFetch(
      { status: 429, body: {}, headers: { "Retry-After": "86400" } },
      { body: OK_PAGE },
    );
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    const settled = eb.org.members.list().then(
      (v) => ({ ok: true as const, v }),
      (e) => ({ ok: false as const, e }),
    );

    await vi.advanceTimersByTimeAsync(29_999);
    expect(spy).toHaveBeenCalledTimes(1); // waiting out the cap, not the header

    await vi.advanceTimersByTimeAsync(1);
    expect(spy).toHaveBeenCalledTimes(2);

    const result = await settled;
    expect(result.ok).toBe(true);
  });

  it("reports the unclamped Retry-After on the surfaced RateLimitError", async () => {
    const { fn } = mockFetch({ status: 429, body: {}, headers: { "Retry-After": "86400" } });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn, maxRetries: 0 });
    const settled = eb.org.members.list().then(
      (v) => ({ ok: true as const, v }),
      (e) => ({ ok: false as const, e }),
    );
    await vi.advanceTimersByTimeAsync(0);
    const result = await settled;
    expect(result.ok).toBe(false);
    expect(((result as { e: unknown }).e as RateLimitError).retryAfter).toBe(86_400);
  });

  it("retries a GET on 5xx with exponential backoff, then succeeds", async () => {
    const { fn, spy } = mockFetch({ status: 502 }, { status: 503 }, { body: OK_PAGE });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn, maxRetries: 2 });
    const settled = eb.passes.list().then(
      (v) => ({ ok: true as const, v }),
      (e) => ({ ok: false as const, e }),
    );
    // Backoff delays are jittered but bounded by 8s each; advance well past both.
    await vi.advanceTimersByTimeAsync(20_000);
    const result = await settled;
    expect(result.ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("gives up after maxRetries and surfaces the mapped error", async () => {
    const { fn, spy } = mockFetch({ status: 429, body: {}, headers: { "Retry-After": "1" } });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn, maxRetries: 2 });
    const settled = eb.org.members.list().then(
      (v) => ({ ok: true as const, v }),
      (e) => ({ ok: false as const, e }),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await settled;
    expect(result.ok).toBe(false);
    expect((result as { e: unknown }).e).toBeInstanceOf(RateLimitError);
    expect(spy).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("does not retry non-idempotent POSTs by default", async () => {
    const { fn, spy } = mockFetch({ status: 502 });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    const settled = eb.org.passes
      .create({ first_name: "A", arrival_date: "2026-08-01", facility_id: 1, email: "a@example.com" })
      .then(
        (v) => ({ ok: true as const, v }),
        (e) => ({ ok: false as const, e }),
      );
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await settled;
    expect(result.ok).toBe(false);
    expect((result as { e: unknown }).e).toBeInstanceOf(APIError);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not retry when maxRetries is 0", async () => {
    const { fn, spy } = mockFetch({ status: 503 });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn, maxRetries: 0 });
    const settled = eb.passes.list().then(
      (v) => ({ ok: true as const, v }),
      (e) => ({ ok: false as const, e }),
    );
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await settled;
    expect(result.ok).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
