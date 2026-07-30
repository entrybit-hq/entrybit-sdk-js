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
const [report] = JSON.parse(out);
const files = report.files.map((f) => f.path);

const stray = files.filter((path) => !ALLOWED.some((re) => re.test(path)));
const missing = REQUIRED.filter((path) => !files.includes(path));

if (stray.length > 0 || missing.length > 0) {
  for (const path of stray) console.error(`Unexpected file in tarball: ${path}`);
  for (const path of missing) console.error(`Missing from tarball: ${path}`);
  process.exit(1);
}
console.log(`Tarball OK: ${files.length} files, dist build plus docs only.`);
