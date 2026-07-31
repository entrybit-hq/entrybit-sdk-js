import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestEvent, ResponseEvent } from "../src/index.js";
import { EntryBit, NotFoundError, UserAbortError } from "../src/index.js";
import { mockFetch } from "./helpers.js";

const OK_PAGE = { success: true, items: [], has_more: false };

describe("client events", () => {
  it("emits 'request' and 'response' once for a plain success, with request id and duration", async () => {
    const { fn } = mockFetch({ body: OK_PAGE, headers: { "x-request-id": "req_evt_1" } });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    const requests: RequestEvent[] = [];
    const responses: ResponseEvent[] = [];
    eb.on("request", (e) => requests.push(e));
    eb.on("response", (e) => responses.push(e));

    await eb.passes.list();

    expect(requests).toEqual([{ method: "GET", path: "/api/v1/passes", attempt: 0 }]);
    expect(responses).toHaveLength(1);
    expect(responses[0]).toMatchObject({
      method: "GET",
      path: "/api/v1/passes",
      status: 200,
      requestId: "req_evt_1",
      attempt: 0,
      willRetry: false,
    });
    expect(responses[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("emits a 'response' event for an error response too (willRetry: false when not retried)", async () => {
    const { fn } = mockFetch({
      status: 404,
      body: { error: "Pass not found" },
      headers: { "x-request-id": "req_evt_404" },
    });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn, maxRetries: 0 });
    const responses: ResponseEvent[] = [];
    eb.on("response", (e) => responses.push(e));

    const err = await eb.passes.get("gst_x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(responses).toEqual([
      expect.objectContaining({ status: 404, requestId: "req_evt_404", willRetry: false }),
    ]);
  });

  it("emits no 'response' event when the request never produces a response", async () => {
    const { fn } = mockFetch({ reject: new TypeError("fetch failed") });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn, maxRetries: 0 });
    const requests: RequestEvent[] = [];
    const responses: ResponseEvent[] = [];
    eb.on("request", (e) => requests.push(e));
    eb.on("response", (e) => responses.push(e));

    await eb.passes.list().catch(() => undefined);
    expect(requests).toHaveLength(1);
    expect(responses).toHaveLength(0);
  });

  it("emits a 'response' event when the caller aborts mid-body (headers already received)", async () => {
    const controller = new AbortController();
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        // Abort the caller's signal, then fail the read the way an aborted
        // fetch body does.
        controller.abort();
        return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
      },
    });
    const { fn } = mockFetch({ rawBody: stream, headers: { "x-request-id": "req_abort" } });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    const responses: ResponseEvent[] = [];
    eb.on("response", (e) => responses.push(e));

    const err = await eb.passes
      .list(undefined, { signal: controller.signal })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(UserAbortError);
    expect((err as UserAbortError).requestId).toBe("req_abort");
    expect((err as UserAbortError).message).toContain("(request id: req_abort)");
    // The response DID arrive (headers), so exactly one event fires —
    // symmetric with the mid-body timeout path.
    expect(responses).toEqual([
      expect.objectContaining({ status: 200, requestId: "req_abort", willRetry: false }),
    ]);
  });

  it("swallows async listener rejections — no unhandled rejection escapes", async () => {
    const { fn } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      eb.on("response", async () => {
        await Promise.reject(new Error("async observer bug"));
      });
      await expect(eb.passes.list()).resolves.toBeDefined();
      // Give a rejected listener promise a macrotask to surface.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("swallows listener exceptions — a throwing observer never fails the request", async () => {
    const { fn } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    const seen: number[] = [];
    eb.on("response", () => {
      throw new Error("observer bug");
    });
    // A second listener registered after the throwing one still runs.
    eb.on("response", (e) => seen.push(e.status));

    await expect(eb.passes.list()).resolves.toBeDefined();
    expect(seen).toEqual([200]);
  });

  it("off() unsubscribes a listener", async () => {
    const { fn } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    const seen: RequestEvent[] = [];
    const listener = (e: RequestEvent) => seen.push(e);
    eb.on("request", listener);
    await eb.passes.list();
    eb.off("request", listener);
    await eb.passes.list();
    expect(seen).toHaveLength(1);
  });

  describe("with retries", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("emits per attempt: a retried 503 reports willRetry true, the settling attempt false", async () => {
      const { fn } = mockFetch(
        { status: 503, body: {}, headers: { "Retry-After": "1", "x-request-id": "req_a" } },
        { body: OK_PAGE, headers: { "x-request-id": "req_b" } },
      );
      const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
      const requests: RequestEvent[] = [];
      const responses: ResponseEvent[] = [];
      eb.on("request", (e) => requests.push(e));
      eb.on("response", (e) => responses.push(e));

      const settled = eb.org.members.list().then(
        (v) => ({ ok: true as const, v }),
        (e) => ({ ok: false as const, e }),
      );
      await vi.advanceTimersByTimeAsync(1_000);
      const result = await settled;

      expect(result.ok).toBe(true);
      expect(requests.map((e) => e.attempt)).toEqual([0, 1]);
      expect(responses).toEqual([
        expect.objectContaining({ status: 503, requestId: "req_a", attempt: 0, willRetry: true }),
        expect.objectContaining({ status: 200, requestId: "req_b", attempt: 1, willRetry: false }),
      ]);
    });
  });
});
