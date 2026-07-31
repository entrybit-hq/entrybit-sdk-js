import { describe, expect, it } from "vitest";
import { CLIENT_TELEMETRY_HEADER, EntryBit } from "../src/index.js";
import { mockFetch } from "./helpers.js";

const OK_PAGE = { success: true, items: [], has_more: false };

describe("header assembly", () => {
  it("sends defaultHeaders on every request", async () => {
    const { fn, requests } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({
      apiKey: "eb_sk_test",
      fetch: fn,
      defaultHeaders: { "X-Trace-Id": "trace-1" },
    });
    await eb.passes.list();
    expect(requests[0]!.headers["x-trace-id"]).toBe("trace-1");
  });

  it("merges header names case-insensitively: a lowercase override replaces the built-in, never duplicates it", async () => {
    const { fn, requests } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({
      apiKey: "eb_sk_test",
      fetch: fn,
      defaultHeaders: { accept: "application/vnd.entrybit+json", "User-Agent": "my-app/1.0" },
    });
    await eb.passes.list();
    // A combined value like "application/json, application/vnd.entrybit+json"
    // would mean both casings were sent.
    expect(requests[0]!.headers["accept"]).toBe("application/vnd.entrybit+json");
    expect(requests[0]!.headers["user-agent"]).toBe("my-app/1.0");
  });

  it("keeps the credential header authoritative over defaultHeaders in any casing", async () => {
    const { fn, requests } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({
      apiKey: "eb_sk_real",
      fetch: fn,
      defaultHeaders: { Authorization: "Bearer stray", authorization: "Bearer stray2" },
    });
    await eb.passes.list();
    expect(requests[0]!.headers["authorization"]).toBe("Bearer eb_sk_real");
  });

  it("keeps the credential header authoritative over per-request headers too", async () => {
    const { fn, requests } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({ apiKey: "eb_sk_real", fetch: fn });
    await eb.passes.list(undefined, { headers: { Authorization: "Bearer stray" } });
    expect(requests[0]!.headers["authorization"]).toBe("Bearer eb_sk_real");
  });

  it("requests redirect: 'error' — the SDK never follows a redirect", async () => {
    const { fn, requests } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    await eb.passes.list();
    expect(requests[0]!.redirect).toBe("error");
  });

  it("keeps redirect: 'error' even when fetchOptions tries to override it", async () => {
    const { fn, requests } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({
      apiKey: "eb_sk_test",
      fetch: fn,
      // A shared RequestInit copied from other code must not be able to
      // re-enable redirect following (credential-forwarding hazard).
      fetchOptions: { redirect: "follow" },
    });
    await eb.passes.list();
    expect(requests[0]!.redirect).toBe("error");
  });

  it("passes fetchOptions through while SDK-owned fields always win", async () => {
    const { fn, requests } = mockFetch({ body: OK_PAGE });
    const sentinel = { marker: true };
    const eb = new EntryBit({
      apiKey: "eb_sk_test",
      fetch: fn,
      fetchOptions: {
        dispatcher: sentinel,
        method: "DELETE",
        headers: { authorization: "Bearer clobber" },
      } as unknown as RequestInit & Record<string, unknown>,
    });
    await eb.passes.list();
    const req = requests[0]!;
    expect(req.init?.dispatcher).toBe(sentinel); // custom field passes through
    expect(req.method).toBe("GET"); // SDK method wins
    expect(req.headers["authorization"]).toBe("Bearer eb_sk_test"); // SDK headers win
    expect(req.signal).toBeInstanceOf(AbortSignal); // SDK signal wins
  });

  it("applies per-request headers over defaultHeaders", async () => {
    const { fn, requests } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({
      apiKey: "eb_sk_test",
      fetch: fn,
      defaultHeaders: { "X-Trace-Id": "client" },
    });
    await eb.passes.list(undefined, { headers: { "x-trace-id": "call" } });
    expect(requests[0]!.headers["x-trace-id"]).toBe("call");
  });

  it("sends Content-Type: application/json on JSON bodies, overridable via defaultHeaders", async () => {
    const { fn, requests } = mockFetch({ body: { success: true, created: 1 } });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    await eb.org.passes.create({ first_name: "A", arrival_date: "2026-08-01", facility_id: 1 });
    expect(requests[0]!.headers["content-type"]).toBe("application/json");
  });

  it("sends the telemetry header with SDK version+build, runtime and OS info", async () => {
    const { fn, requests } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    await eb.passes.list();
    const telemetry = requests[0]!.headers[CLIENT_TELEMETRY_HEADER];
    expect(telemetry).toContain("entrybit-sdk-js/");
    // Semver build metadata: version+sha; source runs (vitest) carry "+dev".
    expect(telemetry).toContain("+dev");
    expect(telemetry).toContain("node/");
  });

  it("appends appInfo to both the User-Agent and the telemetry header", async () => {
    const { fn, requests } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({
      apiKey: "eb_sk_test",
      fetch: fn,
      appInfo: { name: "acme-visitors", version: "2.1.0", url: "https://acme.example" },
    });
    await eb.passes.list();
    const suffix = "acme-visitors/2.1.0 (https://acme.example)";
    expect(requests[0]!.headers["user-agent"]).toContain(suffix);
    expect(requests[0]!.headers[CLIENT_TELEMETRY_HEADER]).toContain(suffix);
  });

  it("omits the telemetry header entirely when telemetry: false", async () => {
    const { fn, requests } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn, telemetry: false });
    await eb.passes.list();
    expect(requests[0]!.headers[CLIENT_TELEMETRY_HEADER]).toBeUndefined();
    // The version-only User-Agent stays (and remains overridable via defaultHeaders).
    expect(requests[0]!.headers["user-agent"]).toContain("entrybit-sdk-js/");
  });
});
