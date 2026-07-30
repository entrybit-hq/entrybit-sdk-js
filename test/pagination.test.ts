import { describe, expect, it } from "vitest";
import { EntryBit } from "../src/index.js";
import type { Member } from "../src/index.js";
import { mockFetch } from "./helpers.js";

const member = (id: string): Member => ({ id, name: id, status: "active" });

describe("cursor pagination iterator", () => {
  it("follows next_cursor across pages and yields every item", async () => {
    const { fn, requests } = mockFetch(
      {
        body: {
          success: true,
          items: [member("emp_1"), member("emp_2")],
          next_cursor: "c1",
          has_more: true,
        },
      },
      {
        body: {
          success: true,
          items: [member("emp_3")],
          next_cursor: "c2",
          has_more: true,
        },
      },
      { body: { success: true, items: [member("emp_4")], next_cursor: null, has_more: false } },
    );
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });

    const seen: string[] = [];
    for await (const m of eb.org.members.iterate({ limit: 2 })) {
      seen.push(m.id!);
    }

    expect(seen).toEqual(["emp_1", "emp_2", "emp_3", "emp_4"]);
    expect(requests).toHaveLength(3);
    const urls = requests.map((r) => new URL(r.url));
    expect(urls[0]!.searchParams.get("cursor")).toBeNull();
    expect(urls[0]!.searchParams.get("limit")).toBe("2");
    expect(urls[1]!.searchParams.get("cursor")).toBe("c1");
    expect(urls[2]!.searchParams.get("cursor")).toBe("c2");
  });

  it("stops when has_more is false even if next_cursor is present", async () => {
    const { fn, requests } = mockFetch({
      body: { success: true, items: [member("emp_1")], next_cursor: "stale", has_more: false },
    });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    const seen: string[] = [];
    for await (const m of eb.org.members.iterate()) seen.push(m.id!);
    expect(seen).toEqual(["emp_1"]);
    expect(requests).toHaveLength(1);
  });

  it("handles an empty first page", async () => {
    const { fn } = mockFetch({ body: { success: true, items: [], has_more: false } });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    const seen: unknown[] = [];
    for await (const m of eb.passes.iterate()) seen.push(m);
    expect(seen).toEqual([]);
  });

  it("supports early break without exhausting pages", async () => {
    const { fn, requests } = mockFetch({
      body: {
        success: true,
        items: [member("emp_1"), member("emp_2")],
        next_cursor: "c1",
        has_more: true,
      },
    });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    for await (const m of eb.org.members.iterate()) {
      if (m.id === "emp_1") break;
    }
    expect(requests).toHaveLength(1);
  });
});
