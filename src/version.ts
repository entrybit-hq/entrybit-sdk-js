/**
 * Bumped automatically by release-please (wired via `extra-files` in
 * release-please-config.json; the trailing annotation marks the line).
 * test/version.test.ts verifies it matches package.json.
 */
export const VERSION = "0.5.0"; // x-release-please-version

/**
 * Short git commit the running bundle was built from, injected by tsup at
 * build time (`define` in tsup.config.ts). Source runs (vitest, tsx, the
 * examples) have no define, so the `typeof` guard falls back to `"dev"`
 * instead of a ReferenceError. Surfaces in `debugInfo()` and the
 * `x-entrybit-client` telemetry header.
 */
export const BUILD_SHA: string =
  typeof __ENTRYBIT_BUILD_SHA__ === "string" ? __ENTRYBIT_BUILD_SHA__ : "dev";
