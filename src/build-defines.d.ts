/**
 * Compile-time constants injected by tsup (`define` in tsup.config.ts).
 * Ambient-only: this file emits nothing and is deliberately separate from
 * `version.ts` so the `declare` never leaks into the bundled public
 * declarations (dist/index.d.ts).
 */
declare const __ENTRYBIT_BUILD_SHA__: string | undefined;
