import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryBit, EntryBitError, USER_AGENT, VERSION } from "../src/index.js";
import { mockFetch } from "./helpers.js";

const OK_PAGE = { success: true, items: [], has_more: false };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("auth modes", () => {
  it("sends an organization API key as Authorization: Bearer by default", async () => {
    const { fn, requests } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({ apiKey: "eb_sk_test123", fetch: fn });
    await eb.org.passes.list();
    expect(requests[0]!.headers["authorization"]).toBe("Bearer eb_sk_test123");
    expect(requests[0]!.headers["x-api-key"]).toBeUndefined();
  });

  it("sends the API key as X-API-Key when configured", async () => {
    const { fn, requests } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({ apiKey: "eb_sk_test123", apiKeyHeader: "x-api-key", fetch: fn });
    await eb.org.members.list();
    expect(requests[0]!.headers["x-api-key"]).toBe("eb_sk_test123");
    expect(requests[0]!.headers["authorization"]).toBeUndefined();
  });

  it("sends a static OAuth access token as Authorization: Bearer", async () => {
    const { fn, requests } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({ accessToken: "at.jwt.token", fetch: fn });
    await eb.passes.list();
    expect(requests[0]!.headers["authorization"]).toBe("Bearer at.jwt.token");
  });

  it("calls getAccessToken before each request", async () => {
    const { fn, requests } = mockFetch({ body: OK_PAGE });
    let n = 0;
    const eb = new EntryBit({ getAccessToken: async () => `tok-${++n}`, fetch: fn });
    await eb.passes.list();
    await eb.passes.list();
    expect(requests[0]!.headers["authorization"]).toBe("Bearer tok-1");
    expect(requests[1]!.headers["authorization"]).toBe("Bearer tok-2");
  });

  it("refreshes the token on each retry attempt, not just once per request", async () => {
    vi.useFakeTimers();
    try {
      const { fn, requests } = mockFetch({ status: 502 }, { body: OK_PAGE });
      let n = 0;
      const eb = new EntryBit({ getAccessToken: () => `tok-${++n}`, fetch: fn, maxRetries: 1 });
      const settled = eb.passes.list().then(
        (v) => ({ ok: true as const, v }),
        (e) => ({ ok: false as const, e }),
      );
      await vi.advanceTimersByTimeAsync(10_000);
      const result = await settled;
      expect(result.ok).toBe(true);
      expect(requests[0]!.headers["authorization"]).toBe("Bearer tok-1");
      expect(requests[1]!.headers["authorization"]).toBe("Bearer tok-2");
    } finally {
      vi.useRealTimers();
    }
  });

  it("shares one in-flight getAccessToken call across concurrent requests", async () => {
    const { fn } = mockFetch({ body: OK_PAGE });
    let calls = 0;
    let release!: (token: string) => void;
    const gate = new Promise<string>((resolve) => {
      release = resolve;
    });
    const eb = new EntryBit({
      getAccessToken: () => {
        calls += 1;
        return gate;
      },
      fetch: fn,
    });

    const first = eb.passes.list();
    const second = eb.passes.list();
    release("tok");
    await Promise.all([first, second]);
    expect(calls).toBe(1); // both requests shared the pending call

    await eb.passes.list();
    expect(calls).toBe(2); // a request after settlement asks again
  });

  it("recovers when getAccessToken rejects: the failure is not memoized", async () => {
    const { fn, requests } = mockFetch({ body: OK_PAGE });
    let calls = 0;
    const eb = new EntryBit({
      getAccessToken: () => {
        calls += 1;
        if (calls === 1) return Promise.reject(new Error("refresh failed"));
        return Promise.resolve("tok-2");
      },
      fetch: fn,
    });

    await expect(eb.passes.list()).rejects.toThrow("refresh failed");
    await eb.passes.list();
    expect(calls).toBe(2);
    expect(requests[0]!.headers["authorization"]).toBe("Bearer tok-2");
  });

  it("propagates a synchronous getAccessToken throw as a rejection", async () => {
    const { fn, spy } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({
      getAccessToken: () => {
        throw new Error("token store not ready");
      },
      fetch: fn,
    });
    await expect(eb.passes.list()).rejects.toThrow("token store not ready");
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects an empty or non-string getAccessToken result before sending", async () => {
    const { fn, spy } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({ getAccessToken: () => "   ", fetch: fn });
    await expect(eb.passes.list()).rejects.toThrow(EntryBitError);
    expect(spy).not.toHaveBeenCalled();
  });

  it("allows an explicitly unauthenticated client via apiKey: null, suppressing the env fallback", async () => {
    // An ambient key must NOT leak onto an explicitly unauthenticated client
    // (which is typically pointed at a non-production baseUrl).
    vi.stubEnv("ENTRYBIT_API_KEY", "eb_sk_ambient");
    const { fn, requests } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({ apiKey: null, baseUrl: "http://localhost:8001/", fetch: fn });
    await eb.passes.list();
    expect(requests[0]!.url).toBe("http://localhost:8001/api/v1/passes");
    expect(requests[0]!.headers["authorization"]).toBeUndefined();
  });

  it("falls back to the ENTRYBIT_API_KEY environment variable", async () => {
    vi.stubEnv("ENTRYBIT_API_KEY", "eb_sk_from_env");
    const { fn, requests } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({ fetch: fn });
    await eb.org.passes.list();
    expect(requests[0]!.headers["authorization"]).toBe("Bearer eb_sk_from_env");
  });

  it("throws at construction when no credential is configured anywhere", () => {
    vi.stubEnv("ENTRYBIT_API_KEY", "");
    expect(() => new EntryBit({})).toThrow(/No credential configured/);
  });

  it("refuses an organization API key in a browser-like environment", () => {
    vi.stubGlobal("window", { document: {} });
    expect(() => new EntryBit({ apiKey: "eb_sk_secret" })).toThrow(/browser/);
    // User-delegated tokens are fine in browsers…
    expect(() => new EntryBit({ accessToken: "tok" })).not.toThrow();
    // …and the explicit escape hatch works.
    expect(
      () => new EntryBit({ apiKey: "eb_sk_secret", dangerouslyAllowBrowser: true }),
    ).not.toThrow();
  });

  it("rejects more than one auth mode", () => {
    expect(() => new EntryBit({ apiKey: "eb_sk_x", accessToken: "tok" })).toThrow(EntryBitError);
    expect(() => new EntryBit({ accessToken: "tok", getAccessToken: () => "tok" })).toThrow(
      EntryBitError,
    );
    expect(() => new EntryBit({ apiKey: "eb_sk_x", getAccessToken: () => "tok" })).toThrow(
      EntryBitError,
    );
  });

  it("rejects empty credentials", () => {
    expect(() => new EntryBit({ apiKey: "  " })).toThrow(EntryBitError);
    expect(() => new EntryBit({ accessToken: "" })).toThrow(EntryBitError);
  });

  it("sends the SDK User-Agent and targets api.entrybit.net by default", async () => {
    const { fn, requests } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({ apiKey: "eb_sk_test123", fetch: fn });
    await eb.org.members.list();
    expect(requests[0]!.headers["user-agent"]).toBe(`entrybit-sdk-js/${VERSION}`);
    expect(USER_AGENT).toBe(`entrybit-sdk-js/${VERSION}`);
    expect(requests[0]!.url).toBe("https://api.entrybit.net/api/v1/org/members");
  });
});
