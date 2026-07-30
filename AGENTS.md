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
npm test               # vitest, one run
npm run test:coverage  # vitest + v8 coverage, thresholds enforced (95/90/90/95)
npm run build          # tsup -> dist/ (ESM + CJS + d.ts + d.cts)
npm run check:exports  # publint + @arethetypeswrong/cli against the packed tarball
npm run pack:verify    # tarball content allowlist
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
- **Header names are merged lowercased** (`mergeHeaders` in `src/http.ts`):
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
- **`src/version.ts` is bumped by release-please** (the
  `x-release-please-version` annotation). Don't bump it by hand.

## Conventions

- Conventional-commit PR titles are enforced (`semantic-pr.yml`) — release
  automation derives versions and the changelog from them. `feat:` = minor,
  `fix:` = patch, `feat!:`/`BREAKING CHANGE:` = major.
- TypeScript is strict, `exactOptionalPropertyTypes` is on: public optional
  props are declared `?: T | undefined`.
- Releases: merging release-please's PR publishes from the `publish` job in
  `.github/workflows/release-please.yml`. There is no tag-triggered publish
  workflow (GITHUB_TOKEN-created tags never trigger workflows).
- GitHub Actions are pinned to full commit SHAs (not tag-object SHAs).
