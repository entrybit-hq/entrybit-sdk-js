import { afterEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "../src/index.js";
import { BUILD_SHA, EntryBit, EntryBitError, VERSION } from "../src/index.js";
import { mockFetch } from "./helpers.js";

const OK_PAGE = { success: true, items: [], has_more: false };

function collectingLogger() {
  const lines: string[] = [];
  const logger: Logger = {
    error: (...args) => lines.push(`error ${String(args[0])}`),
    warn: (...args) => lines.push(`warn ${String(args[0])}`),
    info: (...args) => lines.push(`info ${String(args[0])}`),
    debug: (...args) => lines.push(`debug ${String(args[0])}`),
  };
  return { logger, lines };
}

describe("debugInfo", () => {
  it("reports version, build provenance, resolved config and runtime facts", () => {
    const { fn } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({ apiKey: "eb_sk_secret_value", fetch: fn, timeoutMs: 5_000 });
    const info = eb.debugInfo();

    expect(info.name).toBe("@entrybit/sdk");
    expect(info.version).toBe(VERSION);
    expect(info.buildSha).toBe(BUILD_SHA);
    expect(info.baseUrl).toBe("https://api.entrybit.net");
    expect(info.authMode).toBe("apiKey");
    expect(info.authHeaderName).toBe("authorization");
    expect(info.maxRetries).toBe(2);
    expect(info.timeoutMs).toBe(5_000);
    expect(info.telemetry).toBe(true);
    expect(info.logLevel).toBe("warn");
    expect(info.fetch).toBe("custom");
    expect(info.runtime.node).toBeDefined();
    expect(info.runtime.browserLike).toBe(false);
  });

  it("never contains the credential value", () => {
    const { fn } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({ apiKey: "eb_sk_secret_value", fetch: fn });
    expect(JSON.stringify(eb.debugInfo())).not.toContain("eb_sk_secret_value");
  });

  it("names each auth mode without touching the token", () => {
    const { fn } = mockFetch({ body: OK_PAGE });
    expect(new EntryBit({ accessToken: "tok_x", fetch: fn }).debugInfo().authMode).toBe(
      "accessToken",
    );
    expect(new EntryBit({ getAccessToken: () => "tok_x", fetch: fn }).debugInfo().authMode).toBe(
      "getAccessToken",
    );
    expect(new EntryBit({ apiKey: null, fetch: fn }).debugInfo().authMode).toBe("none");
  });

  it("reports authHeaderName: 'x-api-key' when that transport is configured", () => {
    const { fn } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({ apiKey: "eb_sk_test", apiKeyHeader: "x-api-key", fetch: fn });
    expect(eb.debugInfo().authHeaderName).toBe("x-api-key");
  });

  it("reports fetch: 'global' when globalThis.fetch is passed explicitly", () => {
    const eb = new EntryBit({ apiKey: null, fetch: globalThis.fetch });
    expect(eb.debugInfo().fetch).toBe("global");
  });

  it("caches lazily-constructed resource namespaces", () => {
    const eb = new EntryBit({ apiKey: null });
    expect(eb.passes).toBe(eb.passes);
    expect(eb.org).toBe(eb.org);
    expect(eb.org.members).toBe(eb.org.members);
  });

  it("rejects appInfo values that would corrupt header values", () => {
    expect(() => new EntryBit({ apiKey: null, appInfo: { name: "acme\napp" } })).toThrow(
      EntryBitError,
    );
    expect(
      () => new EntryBit({ apiKey: null, appInfo: { name: "acme", version: "1.0\r\n" } }),
    ).toThrow(/appInfo\.version/);
    expect(() => new EntryBit({ apiKey: null, appInfo: { name: "  " } })).toThrow(/appInfo\.name/);
  });

  it("appends appInfo to the user agent", () => {
    const { fn } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({
      apiKey: "eb_sk_test",
      fetch: fn,
      appInfo: { name: "acme-visitors", version: "2.1.0", url: "https://acme.example" },
    });
    expect(eb.debugInfo().userAgent).toBe(
      `entrybit-sdk-js/${VERSION} acme-visitors/2.1.0 (https://acme.example)`,
    );
  });
});

describe("BUILD_SHA", () => {
  it("is the 'dev' fallback when running from source (no tsup define)", () => {
    expect(BUILD_SHA).toBe("dev");
  });
});

describe("requestWithMeta", () => {
  it("returns data plus status, request id and headers for a 2xx", async () => {
    const { fn } = mockFetch({
      body: OK_PAGE,
      headers: { "x-request-id": "req_meta_1", "x-extra": "yes" },
    });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    const res = await eb.requestWithMeta<typeof OK_PAGE>({
      method: "GET",
      path: "/api/v1/passes",
    });

    expect(res.data).toEqual(OK_PAGE);
    expect(res.status).toBe(200);
    expect(res.requestId).toBe("req_meta_1");
    expect(res.headers.get("x-extra")).toBe("yes");
  });

  it("handles 204: undefined data, metadata still present", async () => {
    const { fn } = mockFetch({ status: 204, headers: { "x-request-id": "req_meta_204" } });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    const res = await eb.requestWithMeta({ method: "DELETE", path: "/api/v1/passes/gst_x" });

    expect(res.data).toBeUndefined();
    expect(res.status).toBe(204);
    expect(res.requestId).toBe("req_meta_204");
  });

  it("leaves requestId undefined when the server sends no x-request-id", async () => {
    const { fn } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    const res = await eb.requestWithMeta({ method: "GET", path: "/api/v1/passes" });
    expect(res.requestId).toBeUndefined();
  });
});

describe("ENTRYBIT_LOG", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("turns on debug logging without a code change", async () => {
    vi.stubEnv("ENTRYBIT_LOG", "debug");
    const { fn } = mockFetch({ body: OK_PAGE, headers: { "x-request-id": "req_log_1" } });
    const { logger, lines } = collectingLogger();
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn, logger });

    await eb.passes.list();

    expect(eb.debugInfo().logLevel).toBe("debug");
    const debugLine = lines.find((l) => l.startsWith("debug"));
    expect(debugLine).toContain("GET /api/v1/passes -> 200");
    expect(debugLine).toContain("request id: req_log_1");
  });

  it("is ignored when it names an unknown level", () => {
    vi.stubEnv("ENTRYBIT_LOG", "verbose");
    const { fn } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    expect(eb.debugInfo().logLevel).toBe("warn");
  });

  it("loses to an explicit logLevel option", () => {
    vi.stubEnv("ENTRYBIT_LOG", "debug");
    const { fn } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn, logLevel: "off" });
    expect(eb.debugInfo().logLevel).toBe("off");
  });
});
