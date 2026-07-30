import { describe, expect, it } from "vitest";
import { EntryBit } from "../src/index.js";
import { mockFetch } from "./helpers.js";

describe("envelope unwrapping", () => {
  it("unwraps facilities.list to the facilities array", async () => {
    const { fn } = mockFetch({
      body: { success: true, facilities: [{ id: 1, name: "HQ" }] },
    });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    const facilities = await eb.org.facilities.list();
    expect(facilities).toEqual([{ id: 1, name: "HQ" }]);
  });

  it("unwraps invites.list to the invites array", async () => {
    const { fn } = mockFetch({
      body: { success: true, invites: [{ id: 7, organization: "Acme" }] },
    });
    const eb = new EntryBit({ accessToken: "tok", fetch: fn });
    const invites = await eb.invites.list();
    expect(invites).toEqual([{ id: 7, organization: "Acme" }]);
  });

  it("returns me.get's response body as-is", async () => {
    const { fn, requests } = mockFetch({
      body: { success: true, member: { name: "Dana" } },
    });
    const eb = new EntryBit({ accessToken: "tok", fetch: fn });
    const me = await eb.me.get();
    expect(me).toMatchObject({ success: true });
    expect(new URL(requests[0]!.url).pathname).toBe("/api/v1/me");
  });
});

describe("org passes surface", () => {
  it("does not expose get() on org.passes — the backend serves no such route", () => {
    const { fn } = mockFetch({ body: { success: true } });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    // @ts-expect-error — org passes have list/iterate/create/revoke only.
    expect(eb.org.passes.get).toBeUndefined();
    // The user-delegated namespace does have it.
    expect(typeof eb.passes.get).toBe("function");
  });
});

describe("request() escape hatch", () => {
  it("sends an authenticated request through the standard pipeline", async () => {
    const { fn, requests } = mockFetch({ body: { success: true, items: [1, 2] } });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    const res = await eb.request<{ success: boolean; items: number[] }>({
      method: "GET",
      path: "/api/v1/org/passes",
      query: { limit: 5 },
    });
    expect(res.items).toEqual([1, 2]);
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/api/v1/org/passes");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(requests[0]!.headers["authorization"]).toBe("Bearer eb_sk_test");
  });
});
