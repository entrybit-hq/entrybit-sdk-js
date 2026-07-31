#!/usr/bin/env node
/**
 * Verifies the published tarball contains exactly what we intend to ship:
 * the dist build plus docs, and nothing else. Uses `npm pack --dry-run`,
 * so no tarball is written. Fails loudly on strays (accidentally shipped
 * source, specs, configs) and on missing build outputs.
 */
import { execFileSync } from "node:child_process";

const ALLOWED = [/^dist\//, /^README\.md$/, /^LICENSE$/, /^CHANGELOG\.md$/, /^package\.json$/];

const REQUIRED = [
  "dist/index.js",
  "dist/index.js.map",
  "dist/index.cjs",
  "dist/index.cjs.map",
  "dist/index.d.ts",
  "dist/index.d.cts",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "package.json",
];

const out = execFileSync("npm", ["pack", "--dry-run", "--json"], {
  encoding: "utf8",
  shell: process.platform === "win32",
});
// npm <= 11 emits a one-element array; npm 12 emits an object keyed by
// package name ({"@entrybit/sdk": {files: [...]}}).
const parsed = JSON.parse(out);
const report = Array.isArray(parsed)
  ? parsed[0]
  : Array.isArray(parsed?.files)
    ? parsed
    : Object.values(parsed ?? {})[0];
if (!report || !Array.isArray(report.files)) {
  console.error("Unexpected `npm pack --json` output shape; cannot verify tarball.");
  process.exit(1);
}
const files = report.files.map((f) => f.path);

const stray = files.filter((path) => !ALLOWED.some((re) => re.test(path)));
const missing = REQUIRED.filter((path) => !files.includes(path));

if (stray.length > 0 || missing.length > 0) {
  for (const path of stray) console.error(`Unexpected file in tarball: ${path}`);
  for (const path of missing) console.error(`Missing from tarball: ${path}`);
  process.exit(1);
}

// Build provenance: a published bundle must carry a real commit SHA, not the
// "dev" source-run fallback or the "unknown" no-git fallback (CI always has
// GITHUB_SHA; local builds have git).
const { BUILD_SHA } = await import(new URL("../dist/index.js", import.meta.url));
if (!/^[0-9a-f]{7,40}$/.test(BUILD_SHA)) {
  console.error(
    `dist/index.js was built with BUILD_SHA ${JSON.stringify(BUILD_SHA)} — rebuild from a git checkout (or CI) so the bundle carries its commit.`,
  );
  process.exit(1);
}

console.log(`Tarball OK: ${files.length} files, dist build plus docs only (build ${BUILD_SHA}).`);
