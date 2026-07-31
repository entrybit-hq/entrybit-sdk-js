#!/usr/bin/env node
/**
 * Bundle size budget, enforced in CI after every build. "Zero dependencies,
 * a few KB gzipped" is a published claim (README § Performance & footprint);
 * this gate turns it into a regression check instead of a slogan. Budgets
 * have ~30% headroom over the current size — raise them consciously in the
 * same PR that grows the bundle, never reflexively.
 */
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const BUDGETS = [
  { file: "dist/index.js", maxGzipBytes: 12_000 },
  { file: "dist/index.cjs", maxGzipBytes: 13_000 },
];

let failed = false;
for (const { file, maxGzipBytes } of BUDGETS) {
  let raw;
  try {
    raw = readFileSync(new URL(`../${file}`, import.meta.url));
  } catch {
    console.error(`Missing ${file} — run \`npm run build\` first.`);
    process.exit(1);
  }
  const gzipBytes = gzipSync(raw, { level: 9 }).length;
  const over = gzipBytes > maxGzipBytes;
  if (over) failed = true;
  console.log(
    `${over ? "OVER" : "ok"}  ${file}: ${(raw.length / 1024).toFixed(1)} KB raw, ` +
      `${(gzipBytes / 1024).toFixed(1)} KB gzip (budget ${(maxGzipBytes / 1024).toFixed(1)} KB)`,
  );
}

if (failed) {
  console.error("Bundle size budget exceeded. Shrink the change or raise the budget deliberately.");
  process.exit(1);
}
