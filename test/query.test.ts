import { describe, expect, it } from "vitest";
import { EntryBit } from "../src/index.js";
import { mockFetch } from "./helpers.js";

const OK_PAGE = { success: true, items: [], has_more: false };

describe("query serialization", () => {
  it("serializes fields as a comma-separated list from an array", async () => {
    const { fn, requests } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    await eb.org.members.list({ fields: ["name", "email", "phone"], limit: 50 });
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/api/v1/org/members");
    expect(url.searchParams.get("fields")).toBe("name,email,phone");
    expect(url.searchParams.get("limit")).toBe("50");
  });

  it("passes fields through unchanged when given as a string", async () => {
    const { fn, requests } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    await eb.org.members.list({ fields: "name,department", status: "all" });
    const url = new URL(requests[0]!.url);
    expect(url.searchParams.get("fields")).toBe("name,department");
    expect(url.searchParams.get("status")).toBe("all");
  });

  it("supports fields on single-member fetches and encodes the id", async () => {
    const { fn, requests } = mockFetch({
      body: { success: true, member: { id: "emp_1", name: "A", status: "active" } },
    });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    const m = await eb.org.members.get("emp_1", { fields: ["name", "email"] });
    expect(m.id).toBe("emp_1");
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/api/v1/org/members/emp_1");
    expect(url.searchParams.get("fields")).toBe("name,email");
  });

  it("omits undefined params entirely", async () => {
    const { fn, requests } = mockFetch({ body: OK_PAGE });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    await eb.org.members.list({ search: undefined, fields: undefined });
    const url = new URL(requests[0]!.url);
    expect(url.search).toBe("");
  });

  it("unwraps single-pass responses and URL-encodes path params", async () => {
    const { fn, requests } = mockFetch({
      body: { success: true, pass: { public_id: "gst_9f1c", status: "expected" } },
    });
    const eb = new EntryBit({ accessToken: "tok", fetch: fn });
    const pass = await eb.passes.get("gst_9f1c");
    expect(pass.public_id).toBe("gst_9f1c");
    expect(new URL(requests[0]!.url).pathname).toBe("/api/v1/passes/gst_9f1c");
  });
});
