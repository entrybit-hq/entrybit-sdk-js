import { describe, expect, it } from "vitest";
import { EntryBit, EntryBitError, USER_AGENT, VERSION } from "../src/index.js";
import { mockFetch } from "./helpers.js";

const OK_PAGE = { success: true, items: [], has_more: false };

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

  it("allows an unauthenticated client (baseUrl override only)", async () => {
    const { fn, requests } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({ baseUrl: "http://localhost:8001/", fetch: fn });
    await eb.passes.list();
    expect(requests[0]!.url).toBe("http://localhost:8001/api/v1/passes");
    expect(requests[0]!.headers["authorization"]).toBeUndefined();
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
    await eb.org.facilities.list();
    expect(requests[0]!.headers["user-agent"]).toBe(`entrybit-sdk-js/${VERSION}`);
    expect(USER_AGENT).toBe(`entrybit-sdk-js/${VERSION}`);
    expect(requests[0]!.url).toBe("https://api.entrybit.net/api/v1/org/facilities");
  });
});
