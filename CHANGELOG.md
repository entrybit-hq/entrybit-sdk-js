# Changelog

All notable changes to this project are documented in this file. It is
maintained by [release-please](https://github.com/googleapis/release-please)
from conventional commits — do not edit it by hand.

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
