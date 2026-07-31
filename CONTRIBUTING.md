# Contributing

Thank you for contributing to the EntryBit Node.js SDK. This document covers local setup, the development workflow, and what we expect from pull requests.

## Prerequisites

- Node.js >= 20.19 (the SDK relies on the built-in `fetch`)
- npm (bundled with Node.js)

## Setup

```sh
git clone https://github.com/entrybit-hq/entrybit-sdk-js.git
cd entrybit-sdk-js
npm ci
```

## Development workflow

| Command                 | Purpose                                                                       |
| ----------------------- | ----------------------------------------------------------------------------- |
| `npm run typecheck`     | Typecheck with `tsc --noEmit` (includes `test/`, `examples/`)                 |
| `npm run lint`          | Lint with ESLint (type-aware)                                                 |
| `npm run format`        | Format with Prettier (write mode)                                             |
| `npm run format:check`  | Check formatting with Prettier (enforced in CI)                               |
| `npm test`              | Run the Vitest suite once                                                     |
| `npm run test:watch`    | Run tests in watch mode                                                       |
| `npm run test:coverage` | Run tests with enforced coverage thresholds                                   |
| `npm run build`         | Build ESM + CJS bundles with tsup                                             |
| `npm run check:exports` | Validate the packed tarball with publint + arethetypeswrong                   |
| `npm run generate`      | Regenerate `src/generated/schema.d.ts` from the committed `spec/openapi.json` |
| `npm run regenerate`    | Refetch the published OpenAPI spec, then regenerate                           |

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

- **Use a conventional-commit title** (enforced by CI): `feat: …`, `fix: …`, `docs: …`, `chore: …`, with `feat!:` or a `BREAKING CHANGE:` footer for breaking changes. Release automation derives version bumps and the changelog from these — a non-conventional squash-merge title produces no release.
- Keep changes focused; unrelated refactors belong in separate pull requests.
- Add or update tests for any behavior change.
- All CI gates must pass: generate (no drift), lint, format check, typecheck, tests + coverage, build, size budget, exports check.
- Public API changes require documentation updates in the README (and the matching `test/readme-samples.ts` block). The changelog is generated — do not edit `CHANGELOG.md` by hand.
- Breaking changes to the exported surface are only accepted with a clear migration note.

## Releases

Releases are automated with [release-please](https://github.com/googleapis/release-please): merging to `main` maintains a release pull request that bumps the version (including `src/version.ts`) and updates the changelog. Merging that pull request runs the `publish` job in the same workflow — gated on the `npm` environment — which re-runs every CI gate and then publishes.

Publishing authenticates with npm [trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC): the package's npm settings trust exactly this repository, workflow and environment, so no token secret exists and provenance attestations are generated automatically. Only npm package maintainers can change the trusted-publisher configuration.

Note: publishing deliberately lives in `release-please.yml` rather than a tag-triggered workflow — tags created with the default `GITHUB_TOKEN` never trigger other workflows.

## Reporting issues

Use the issue forms for bugs and feature requests. For anything security-sensitive, do not open a public issue; see [SECURITY.md](./SECURITY.md).
