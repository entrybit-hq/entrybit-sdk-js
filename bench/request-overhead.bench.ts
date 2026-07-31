/**
 * Micro-benchmarks for the SDK's own overhead (`npm run bench`). Not run in
 * CI — timings are hardware-dependent; the value is comparing the entrybit
 * rows against the raw-fetch baseline on the same machine: the delta is what
 * the SDK adds (auth headers, retry/timeout plumbing, error mapping).
 */
import { bench, describe } from "vitest";
import { EntryBit } from "../src/index.js";

const BODY = JSON.stringify({ success: true, items: [], has_more: false });

const stubFetch: typeof globalThis.fetch = () =>
  Promise.resolve(
    new Response(BODY, { status: 200, headers: { "content-type": "application/json" } }),
  );

describe("client construction", () => {
  bench("new EntryBit({ apiKey })", () => {
    void new EntryBit({ apiKey: "eb_sk_bench", fetch: stubFetch });
  });
});

describe("request overhead (stub fetch, no network)", () => {
  const entrybit = new EntryBit({ apiKey: "eb_sk_bench", fetch: stubFetch });
  const observed = new EntryBit({ apiKey: "eb_sk_bench", fetch: stubFetch });
  observed.on("response", () => {});

  bench("baseline: raw fetch + JSON.parse", async () => {
    const res = await stubFetch("https://api.entrybit.net/api/v1/passes");
    JSON.parse(await res.text());
  });

  bench("entrybit.passes.list()", async () => {
    await entrybit.passes.list();
  });

  bench("entrybit.passes.list() with a response listener", async () => {
    await observed.passes.list();
  });
});
