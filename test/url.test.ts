import { describe, expect, it } from "vitest";
import { EntryBit, EntryBitError } from "../src/index.js";
import { mockFetch } from "./helpers.js";

describe("URL construction", () => {
  it("percent-encodes path parameters with reserved characters", async () => {
    const { fn, requests } = mockFetch({
      body: { success: true, member: { id: "emp_1", name: "A", status: "active" } },
    });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    await eb.org.members.get("emp/1 ?#&");
    const url = requests[0]!.url;
    expect(url).toBe("https://api.entrybit.net/api/v1/org/members/emp%2F1%20%3F%23%26");
    // The encoded id must not introduce extra path segments or a query string.
    expect(new URL(url).pathname.split("/").pop()).toBe("emp%2F1%20%3F%23%26");
    expect(new URL(url).search).toBe("");
  });

  it("rejects path parameters the URL parser would rewrite into other endpoints", async () => {
    const { fn, spy } = mockFetch({ body: { success: true } });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    await expect(eb.passes.get("")).rejects.toThrow(EntryBitError);
    await expect(eb.passes.get("   ")).rejects.toThrow(EntryBitError);
    await expect(eb.passes.get(".")).rejects.toThrow(EntryBitError);
    await expect(eb.passes.get("..")).rejects.toThrow(EntryBitError);
    await expect(eb.passes.revoke("..")).rejects.toThrow(EntryBitError);
    await expect(eb.org.members.get("..")).rejects.toThrow(EntryBitError);
    expect(spy).not.toHaveBeenCalled();
  });

  it("strips trailing slashes from baseUrl so paths never double up", async () => {
    const { fn, requests } = mockFetch({ body: { success: true, items: [], has_more: false } });
    const eb = new EntryBit({ apiKey: null, baseUrl: "http://localhost:8001//", fetch: fn });
    await eb.passes.list();
    expect(requests[0]!.url).toBe("http://localhost:8001/api/v1/passes");
  });
});
