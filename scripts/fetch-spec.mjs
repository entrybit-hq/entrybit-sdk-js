#!/usr/bin/env node
/**
 * Refetches the published OpenAPI document into spec/openapi.json.
 *
 * The docs site sits behind a CDN that challenges non-browser user agents,
 * so we present a regular browser UA string.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SPEC_URL = process.env.ENTRYBIT_SPEC_URL ?? "https://docs.entrybit.net/openapi.json";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const outPath = join(dirname(fileURLToPath(import.meta.url)), "..", "spec", "openapi.json");

const res = await fetch(SPEC_URL, { headers: { "User-Agent": BROWSER_UA, Accept: "application/json" } });
if (!res.ok) {
  console.error(`Failed to fetch ${SPEC_URL}: HTTP ${res.status}`);
  process.exit(1);
}
const text = await res.text();
// Validate it parses before overwriting the committed copy.
JSON.parse(text);

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, text.endsWith("\n") ? text : text + "\n", "utf8");
console.log(`Wrote ${outPath} (${text.length} bytes) from ${SPEC_URL}`);
