import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionError, EntryBit, InternalServerError, RateLimitError, UserAbortError } from "../src/index.js";
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

  it("honors Retry-After on a retryable 503, not just 429", async () => {
    const { fn, spy } = mockFetch(
      { status: 503, body: {}, headers: { "Retry-After": "5" } },
      { body: OK_PAGE },
    );
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    const settled = eb.org.members.list().then(
      (v) => ({ ok: true as const, v }),
      (e) => ({ ok: false as const, e }),
    );

    await vi.advanceTimersByTimeAsync(4_999);
    expect(spy).toHaveBeenCalledTimes(1); // waiting out the server's ask

    await vi.advanceTimersByTimeAsync(1);
    expect(spy).toHaveBeenCalledTimes(2);

    const result = await settled;
    expect(result.ok).toBe(true);
  });

  it("honors an HTTP-date Retry-After", async () => {
    vi.setSystemTime(new Date("2026-07-30T12:00:00Z"));
    const { fn, spy } = mockFetch(
      {
        status: 429,
        body: {},
        headers: { "Retry-After": new Date("2026-07-30T12:00:04Z").toUTCString() },
      },
      { body: OK_PAGE },
    );
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    const settled = eb.org.members.list().then(
      (v) => ({ ok: true as const, v }),
      (e) => ({ ok: false as const, e }),
    );

    await vi.advanceTimersByTimeAsync(3_999);
    expect(spy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(spy).toHaveBeenCalledTimes(2);

    const result = await settled;
    expect(result.ok).toBe(true);
  });

  it("does not retry when Retry-After exceeds the 30s cap: surfaces the error with the unclamped value", async () => {
    const { fn, spy } = mockFetch({ status: 429, body: {}, headers: { "Retry-After": "86400" } });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn, maxRetries: 2 });
    const settled = eb.org.members.list().then(
      (v) => ({ ok: true as const, v }),
      (e) => ({ ok: false as const, e }),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await settled;
    expect(result.ok).toBe(false);
    expect((result as { e: unknown }).e).toBeInstanceOf(RateLimitError);
    expect(((result as { e: unknown }).e as RateLimitError).retryAfter).toBe(86_400);
    expect(spy).toHaveBeenCalledTimes(1); // no retry was attempted at all
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

  it("retries a GET whose connection fails outright (fetch rejects), then succeeds", async () => {
    const { fn, spy } = mockFetch({ reject: new TypeError("fetch failed") }, { body: OK_PAGE });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn, maxRetries: 1 });
    const settled = eb.passes.list().then(
      (v) => ({ ok: true as const, v }),
      (e) => ({ ok: false as const, e }),
    );
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await settled;
    expect(result.ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("maps a connection failure that exhausts retries to ConnectionError with the cause attached", async () => {
    const boom = new TypeError("fetch failed");
    const { fn, spy } = mockFetch({ reject: boom });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn, maxRetries: 1 });
    const settled = eb.passes.list().then(
      (v) => ({ ok: true as const, v }),
      (e) => ({ ok: false as const, e }),
    );
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await settled;
    expect(result.ok).toBe(false);
    const err = (result as { e: unknown }).e;
    expect(err).toBeInstanceOf(ConnectionError);
    expect((err as ConnectionError).cause).toBe(boom);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("does not retry a POST on connection failure", async () => {
    const { fn, spy } = mockFetch({ reject: new TypeError("fetch failed") });
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
    expect((result as { e: unknown }).e).toBeInstanceOf(ConnectionError);
    expect(spy).toHaveBeenCalledTimes(1);
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
    expect((result as { e: unknown }).e).toBeInstanceOf(InternalServerError);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not auto-retry a DELETE revoke: a lost success response must not become a phantom 404/409", async () => {
    const { fn, spy } = mockFetch({ status: 502 });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn, maxRetries: 2 });
    const settled = eb.org.passes.revoke("gst_x").then(
      (v) => ({ ok: true as const, v }),
      (e) => ({ ok: false as const, e }),
    );
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await settled;
    expect(result.ok).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("settles promptly with UserAbortError when the caller aborts during a Retry-After wait", async () => {
    const { fn, spy } = mockFetch(
      { status: 429, body: {}, headers: { "Retry-After": "20" } },
      { body: OK_PAGE },
    );
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    const controller = new AbortController();
    const settled = eb.org.members.list(undefined, { signal: controller.signal }).then(
      (v) => ({ ok: true as const, v }),
      (e) => ({ ok: false as const, e }),
    );
    await vi.advanceTimersByTimeAsync(1_000); // 1s into the 20s server-directed wait
    controller.abort();
    await vi.advanceTimersByTimeAsync(0); // no further time passes
    const result = await settled;
    expect(result.ok).toBe(false);
    expect((result as { e: unknown }).e).toBeInstanceOf(UserAbortError);
    expect(spy).toHaveBeenCalledTimes(1); // the retry attempt never launched
  });

  it("emits a retry log line at logLevel info — without header values — and stays silent by default", async () => {
    const lines: string[] = [];
    const logger = {
      error: (...a: unknown[]) => lines.push(a.join(" ")),
      warn: (...a: unknown[]) => lines.push(a.join(" ")),
      info: (...a: unknown[]) => lines.push(a.join(" ")),
      debug: (...a: unknown[]) => lines.push(a.join(" ")),
    };
    const { fn } = mockFetch({ status: 502 }, { body: OK_PAGE });
    const eb = new EntryBit({
      apiKey: "eb_sk_secret",
      fetch: fn,
      maxRetries: 1,
      logger,
      logLevel: "info",
    });
    const settled = eb.passes.list().then(
      (v) => ({ ok: true as const, v }),
      (e) => ({ ok: false as const, e }),
    );
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await settled).ok).toBe(true);
    const retryLine = lines.find((l) => l.includes("retrying GET /api/v1/passes"));
    expect(retryLine).toBeDefined();
    expect(retryLine).toContain("HTTP 502");
    expect(lines.join("\n")).not.toContain("eb_sk_secret");

    // Default logLevel ("warn") emits nothing for the same flow.
    const silent: string[] = [];
    const { fn: fn2 } = mockFetch({ status: 502 }, { body: OK_PAGE });
    const eb2 = new EntryBit({
      apiKey: "eb_sk_secret",
      fetch: fn2,
      maxRetries: 1,
      logger: { ...logger, info: (...a: unknown[]) => silent.push(a.join(" ")) },
    });
    const settled2 = eb2.passes.list().then(
      (v) => ({ ok: true as const, v }),
      (e) => ({ ok: false as const, e }),
    );
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await settled2).ok).toBe(true);
    expect(silent).toEqual([]);
  });

  it("honors a per-request maxRetries override in both directions", async () => {
    const { fn, spy } = mockFetch({ status: 502 }, { status: 502 }, { body: OK_PAGE });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn, maxRetries: 0 });
    const settled = eb.passes.list(undefined, { maxRetries: 2 }).then(
      (v) => ({ ok: true as const, v }),
      (e) => ({ ok: false as const, e }),
    );
    await vi.advanceTimersByTimeAsync(20_000);
    expect((await settled).ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(3);

    const { fn: fn2, spy: spy2 } = mockFetch({ status: 502 });
    const eb2 = new EntryBit({ apiKey: "eb_sk_test", fetch: fn2, maxRetries: 2 });
    const settled2 = eb2.passes.list(undefined, { maxRetries: 0 }).then(
      (v) => ({ ok: true as const, v }),
      (e) => ({ ok: false as const, e }),
    );
    await vi.advanceTimersByTimeAsync(20_000);
    expect((await settled2).ok).toBe(false);
    expect(spy2).toHaveBeenCalledTimes(1);
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
