import { describe, expect, it, vi } from "vitest";
import { APIError, ConnectionError, EntryBit } from "../src/index.js";
import { HttpClient } from "../src/http.js";
import { mockFetch } from "./helpers.js";

const OK_PAGE = { success: true, items: [], has_more: false };

/** A body stream that fails mid-read, as when a timeout aborts the transfer. */
function abortingBody(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"success":'));
      controller.error(new DOMException("The operation was aborted.", "AbortError"));
    },
  });
}

describe("response body handling", () => {
  it("maps a body read that aborts mid-stream to ConnectionError", async () => {
    const { fn } = mockFetch({ rawBody: abortingBody() });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn, maxRetries: 0 });
    const err = await eb.passes.list().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConnectionError);
    expect((err as ConnectionError).message).toContain("/api/v1/passes");
  });

  it("retries a GET whose body read aborts mid-stream", async () => {
    vi.useFakeTimers();
    try {
      const { fn, spy } = mockFetch({ rawBody: abortingBody() }, { body: OK_PAGE });
      const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn, maxRetries: 1 });
      const settled = eb.passes.list().then(
        (v) => ({ ok: true as const, v }),
        (e) => ({ ok: false as const, e }),
      );
      await vi.advanceTimersByTimeAsync(10_000);
      const result = await settled;
      expect(result.ok).toBe(true);
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("raises APIError on a malformed JSON success body without retrying", async () => {
    const { fn, spy } = mockFetch({ rawBody: '{"success": tru' });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn, maxRetries: 2 });
    const err = await eb.passes.list().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(APIError);
    expect((err as APIError).message).toContain("Expected a JSON response body");
    expect((err as APIError).body).toBe('{"success": tru');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("resolves undefined for a 204 with no body", async () => {
    const { fn } = mockFetch({ status: 204 });
    const http = new HttpClient({ apiKey: "eb_sk_test", fetch: fn });
    await expect(
      http.request({ method: "DELETE", path: "/api/v1/passes/gst_x" }),
    ).resolves.toBeUndefined();
  });

  it("resolves undefined for a 200 with an empty body", async () => {
    const { fn } = mockFetch({ rawBody: "" });
    const http = new HttpClient({ apiKey: "eb_sk_test", fetch: fn });
    await expect(http.request({ method: "GET", path: "/api/v1/me" })).resolves.toBeUndefined();
  });

  it("uses a non-JSON error body as the error message, truncated", async () => {
    const html = "<html><body>Bad Gateway" + "x".repeat(500) + "</body></html>";
    const { fn } = mockFetch({
      status: 502,
      rawBody: html,
      headers: { "Content-Type": "text/html" },
    });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn, maxRetries: 0 });
    const err = await eb.passes.list().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(APIError);
    expect((err as APIError).message).toContain("Bad Gateway");
    expect((err as APIError).message.length).toBeLessThanOrEqual(200);
    expect((err as APIError).status).toBe(502);
  });
});
