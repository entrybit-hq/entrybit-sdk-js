# Changelog

All notable changes to this project are documented in this file. It is
maintained by [release-please](https://github.com/googleapis/release-please)
from conventional commits — do not edit it by hand.

## [0.5.0](https://github.com/entrybit-hq/entrybit-sdk-js/compare/v0.4.0...v0.5.0) (2026-07-31)


### Features

* user-delegated controllers and door opening ([#13](https://github.com/entrybit-hq/entrybit-sdk-js/issues/13)) ([67a9f56](https://github.com/entrybit-hq/entrybit-sdk-js/commit/67a9f5653b9e4e9017340a67993c1e7ecc210516))

## [0.4.0](https://github.com/entrybit-hq/entrybit-sdk-js/compare/v0.3.0...v0.4.0) (2026-07-31)


### Features

* pass display options, pass templates, and the access-control surface ([#11](https://github.com/entrybit-hq/entrybit-sdk-js/issues/11)) ([8ae98a3](https://github.com/entrybit-hq/entrybit-sdk-js/commit/8ae98a3e102b75dafc7f078beca8504181570994))

## [0.3.0](https://github.com/entrybit-hq/entrybit-sdk-js/compare/v0.2.1...v0.3.0) (2026-07-31)


### Features

* debugging surface, build provenance, and a lighter core ([#9](https://github.com/entrybit-hq/entrybit-sdk-js/issues/9)) ([b2e4f32](https://github.com/entrybit-hq/entrybit-sdk-js/commit/b2e4f326618c953f64c24b4fbb90af937f2b14a8))

## [0.2.1](https://github.com/entrybit-hq/entrybit-sdk-js/compare/v0.2.0...v0.2.1) (2026-07-30)


### Bug Fixes

* linear-time trailing-slash normalization in baseUrl ([1a6835b](https://github.com/entrybit-hq/entrybit-sdk-js/commit/1a6835bbc5051e2320f912b46fe74cf395e565b2))

## [0.2.0](https://github.com/entrybit-hq/entrybit-sdk-js/compare/v0.1.0...v0.2.0) (2026-07-30)


### Features

* initial release of @entrybit/sdk v0.1.0 ([4fa802f](https://github.com/entrybit-hq/entrybit-sdk-js/commit/4fa802fc7a03c41a1f8007874279e917573d862f))
* per-request options, OAuth endpoints, module restructure, release pipeline fixes ([e0a67c5](https://github.com/entrybit-hq/entrybit-sdk-js/commit/e0a67c592a51eadd607f310e1e0b2ab10f3b9929))
* per-request options, OAuth endpoints, module restructure, release pipeline fixes ([4011072](https://github.com/entrybit-hq/entrybit-sdk-js/commit/4011072e192f398ec30bb328c622f1425e981260))

## [0.1.0] - 2026-07-30

### Added

- Initial release of `@entrybit/sdk`.
- `EntryBit` client with two mutually exclusive auth modes: organization API key
  (`Authorization: Bearer` or `X-API-Key`) and user-delegated OAuth2 access
  token (static or via a `getAccessToken` callback).
- Resource namespaces mirroring `/api/v1`: `passes`, `org.passes`,
  `org.members`, `org.facilities`, `facilities`, `invites`, and `me`.
- Request/response types generated from the published OpenAPI 3.1 spec, with a
  CI gate that fails on drift between the committed spec and generated types.
- Typed error hierarchy under `EntryBitError`: `AuthenticationError`,
  `PermissionError` (with `missingScope`), `RateLimitError` (with
  `retryAfter`), `ValidationError`, `APIError`, and `ConnectionError`.
- Automatic retries for idempotent `GET` requests on `429` and `5xx` with
  exponential backoff, jitter, and `Retry-After` support.
- Cursor pagination: `list()` for single pages and `iterate()` async iterators
  that follow `next_cursor`.
- Dual ESM/CJS build with type definitions; zero runtime dependencies.

[0.1.0]: https://github.com/entrybit-hq/entrybit-sdk-js/releases/tag/v0.1.0
