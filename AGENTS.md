# AGENTS.md

Instructions for AI coding agents working in this repository. Humans: see
[CONTRIBUTING.md](./CONTRIBUTING.md).

## What this is

`@entrybit/sdk` — the official TypeScript SDK for the EntryBit API (guest
passes, member directory, facilities, OAuth). Zero runtime dependencies,
Node >= 20.19, built-in `fetch`, dual ESM/CJS build via tsup.

## Commands

```sh
npm ci                 # install (from the repo root; this is NOT a workspace repo)
npm run typecheck      # tsc --noEmit — includes test/, examples/, scripts/
npm run lint           # ESLint, type-aware (no-floating-promises is on)
npm run format         # Prettier, write mode (printWidth 100, defaults otherwise)
npm run format:check   # Prettier check — enforced in CI; run after editing
npm test               # vitest, one run
npm run test:coverage  # vitest + v8 coverage, thresholds enforced (95/90/90/95)
npm run build          # tsup -> dist/ (ESM + CJS + d.ts + d.cts)
npm run size           # gzip size budget on dist/ — enforced in CI after build
npm run bench          # vitest micro-benchmarks (local only, not a CI gate)
npm run check:exports  # publint + @arethetypeswrong/cli against the packed tarball
npm run pack:verify    # tarball allowlist + BUILD_SHA provenance check
npm run generate       # regenerate src/generated/schema.d.ts from spec/openapi.json
```

Every gate above runs in CI; run the relevant ones before declaring a change done.

## Layout

- `src/index.ts` — the only entry; every public export goes through it.
- `src/client.ts` — the `EntryBit` class wiring resources to the HTTP core.
- `src/core/` — runtime machinery: `http.ts` (auth, retries, timeout, header
  merging), `backoff.ts`, `query.ts`, `response.ts` (status→error mapping),
  `pagination.ts`, `params.ts` (path-param validation), `runtime.ts`
  (env/browser/telemetry detection).
- `src/errors/` — the error hierarchy + `WWW-Authenticate`/`Retry-After` parsers.
- `src/resources/` — one file per API resource (`passes`, `members`,
  `facilities`, `invites`, `me`, `org`, `oauth`). Runtime classes only.
- `src/types/` — one types file per domain plus `index.ts`; `export type`
  only, erased at build time. New public types go here, not in resources.
- `src/generated/schema.d.ts` — GENERATED from `spec/openapi.json`. Never
  hand-edit; run `npm run generate` and commit the result. CI fails on drift.
- `spec/openapi.json` — vendored copy of the published OpenAPI document. The
  canonical source lives in the backend repo; refresh with `npm run regenerate`.
- `test/` — vitest suite. `helpers.ts` has the queued `mockFetch`.
  `readme-samples.ts` transcribes README code blocks and is typechecked in CI.
- `examples/` — runnable examples, typechecked via the tsconfig `paths`
  mapping of `@entrybit/sdk` to `src/index.ts`.

## Invariants — do not break these

- **Zero runtime dependencies.** Never add one without explicit maintainer
  sign-off; the tarball allowlist and README advertise it.
- **Header names are merged lowercased** (`mergeHeaders` in `src/core/http.ts`):
  HTTP headers are case-insensitive, plain-object spreads are not. Any new
  header must go through that merge.
- **Auth headers resolve per attempt** inside the retry loop. OAuth
  token/revoke/introspect endpoints send NO client credential
  (`unauthenticated: true`); `userinfo()` intentionally uses the client's
  access token.
- **Writes are never auto-retried** — including `revoke` (the API answers
  404/409 for an already-revoked pass, so a retry after a lost response would
  fake a failure). Token-exchange calls must never be retried (single-use codes).
- **Path parameters** go through `encodePathParam` (rejects `""`, `.`, `..`).
- **Redirects are errors** (`redirect: "error"`): following one could forward
  the X-API-Key credential cross-origin.
- **`org.passes` has no `get()`** — the backend serves no such route. Don't
  "fix" the asymmetry with `passes.get`.
- **README code samples** must be mirrored in `test/readme-samples.ts` (the
  sync is manual; update both sides).
- **Errors never carry request headers** — response data only. Never log or
  interpolate credentials anywhere, including error messages.
- **Observability never leaks payloads.** Log lines, `"request"`/`"response"`
  events and `debugInfo()` carry method/path/status/duration/request-id and
  configuration _modes_ only — never headers, bodies, query values or
  credential values. The README § Privacy section is a published contract:
  any change to what the SDK transmits (`User-Agent`, `x-entrybit-client`)
  must amend that section in the same PR.
- **Event listeners can't break requests** — `ClientEvents.emit` swallows
  listener exceptions; keep it that way.
- **`src/version.ts` is bumped by release-please** (the
  `x-release-please-version` annotation). Don't bump it by hand.
  `BUILD_SHA` next to it is injected by tsup (`define`) and falls back to
  `"dev"` on source runs — the ambient declare lives in
  `src/build-defines.d.ts` so it never leaks into the published d.ts.

## Conventions

- Conventional-commit PR titles are enforced (`semantic-pr.yml`) — release
  automation derives versions and the changelog from them. `feat:` = minor,
  `fix:` = patch, `feat!:`/`BREAKING CHANGE:` = major.
- **Naming**: camelCase for everything the SDK defines (methods, options,
  properties, locals), PascalCase for classes/types, SCREAMING_SNAKE_CASE for
  module-level constants, kebab-case file names. snake_case appears ONLY on
  identifiers that mirror the wire format (generated schema types and the
  hand-written types/params that must match it — e.g. `next_cursor`,
  `first_name`). Two deliberate exceptions, do not "fix" them:
  `oauth.userinfo()` mirrors the OIDC `/userinfo` endpoint name, and the
  `ApiKeyHeader` type keeps the casing of the `apiKeyHeader` option it
  belongs to (while error classes follow the ecosystem's `APIError` style).
- Formatting is Prettier's (config: `printWidth: 100`, defaults otherwise);
  `eslint-config-prettier` keeps the linter out of formatting. Run
  `npm run format` rather than hand-wrapping lines.
- TypeScript is strict, `exactOptionalPropertyTypes` is on: public optional
  props are declared `?: T | undefined`.
- Releases: merging release-please's PR publishes from the `publish` job in
  `.github/workflows/release-please.yml`. There is no tag-triggered publish
  workflow (GITHUB_TOKEN-created tags never trigger workflows).
- GitHub Actions are pinned to full commit SHAs (not tag-object SHAs).
