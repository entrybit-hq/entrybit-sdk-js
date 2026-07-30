# Contributing

Thank you for contributing to the EntryBit Node.js SDK. This document covers local setup, the development workflow, and what we expect from pull requests.

## Prerequisites

- Node.js >= 20 (the SDK relies on the built-in `fetch`)
- npm (bundled with Node.js)

## Setup

```sh
git clone https://github.com/entrybit-hq/entrybit-sdk-js.git
cd entrybit-sdk-js
npm ci
```

## Development workflow

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Typecheck with `tsc --noEmit` (includes `test/readme-samples.ts`) |
| `npm run lint` | Lint with ESLint |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run build` | Build ESM + CJS bundles with tsup |
| `npm run generate` | Regenerate `src/generated/schema.d.ts` from the committed `spec/openapi.json` |
| `npm run regenerate` | Refetch the published OpenAPI spec, then regenerate |

## Generated code

`src/generated/schema.d.ts` is derived from `spec/openapi.json` and must never be edited by hand. CI regenerates it and fails on drift:

```sh
npm run generate
git diff --exit-code -- src/generated
```

If your change requires new API surface, update the spec first (via `npm run regenerate` against the published spec), commit the regenerated types, and build the handwritten layer on top.

## README code samples

Every code sample in `README.md` is transcribed into `test/readme-samples.ts`, which is typechecked in CI. If you change a sample in the README, update the corresponding block in that file (and vice versa) so the two never drift.

## Pull requests

- Keep changes focused; unrelated refactors belong in separate pull requests.
- Add or update tests for any behavior change.
- All CI gates must pass: generate (no drift), lint, typecheck, tests, build.
- Public API changes require an entry under `Unreleased` in `CHANGELOG.md` and documentation updates in the README.
- Breaking changes to the exported surface are only accepted with a clear migration note.

## Releases

Releases are automated with [release-please](https://github.com/googleapis/release-please): merging to `main` maintains a release pull request that bumps the version and updates the changelog. Merging that pull request creates a `vX.Y.Z` tag, which triggers the publish workflow.

The publish workflow runs every CI gate and then `npm publish --provenance --access public`. It authenticates with the `NPM_TOKEN` repository secret, which must be an npm automation token authorized to publish `@entrybit/sdk`. Only repository administrators can set or rotate this secret.

## Reporting issues

Use the issue forms for bugs and feature requests. For anything security-sensitive, do not open a public issue; see [SECURITY.md](./SECURITY.md).
