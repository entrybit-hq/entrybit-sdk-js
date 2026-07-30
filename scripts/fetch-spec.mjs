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

if (new URL(SPEC_URL).protocol !== "https:") {
  console.error(`Refusing to fetch the spec over ${new URL(SPEC_URL).protocol} — use https.`);
  process.exit(1);
}

const outPath = join(dirname(fileURLToPath(import.meta.url)), "..", "spec", "openapi.json");

const res = await fetch(SPEC_URL, { headers: { "User-Agent": BROWSER_UA, Accept: "application/json" } });
if (!res.ok) {
  console.error(`Failed to fetch ${SPEC_URL}: HTTP ${res.status}`);
  process.exit(1);
}
const text = await res.text();

// Validate the payload is structurally an OpenAPI 3.x document before
// overwriting the committed copy — a CDN challenge page or tampered response
// must never become the source of the shipped types.
let doc;
try {
  doc = JSON.parse(text);
} catch {
  console.error("Downloaded document is not valid JSON; leaving spec/openapi.json untouched.");
  process.exit(1);
}
if (typeof doc?.openapi !== "string" || !doc.openapi.startsWith("3.")) {
  console.error("Downloaded document has no OpenAPI 3.x version field; refusing to write it.");
  process.exit(1);
}
const pathCount = doc.paths && typeof doc.paths === "object" ? Object.keys(doc.paths).length : 0;
if (pathCount === 0) {
  console.error("Downloaded document declares no paths; refusing to write it.");
  process.exit(1);
}

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, text.endsWith("\n") ? text : text + "\n", "utf8");
console.log(`Wrote ${outPath} (${text.length} bytes, ${pathCount} paths) from ${SPEC_URL}`);
