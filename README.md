# EntryBit Node.js SDK

[![npm version](https://img.shields.io/npm/v/%40entrybit%2Fsdk.svg)](https://www.npmjs.com/package/@entrybit/sdk)
[![CI](https://github.com/entrybit-hq/entrybit-sdk-js/actions/workflows/ci.yml/badge.svg)](https://github.com/entrybit-hq/entrybit-sdk-js/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/%40entrybit%2Fsdk.svg)](./LICENSE)

The official TypeScript SDK for the [EntryBit API](https://docs.entrybit.net) — guest passes, the organization member directory, and facilities.

- Typed end to end: generated from the published [OpenAPI 3.1 spec](https://docs.entrybit.net/openapi.json), with an ergonomic handwritten layer on top.
- Ships ESM and CommonJS builds with full type definitions.
- Zero runtime dependencies.

## Requirements

Node.js 20 or later (the SDK uses the built-in `fetch`). Other runtimes work if a WHATWG `fetch` is available — or pass your own via `new EntryBit({ fetch })`.

## Installation

```sh
npm install @entrybit/sdk
```

## Usage

The client needs a credential for your organization. In the EntryBit console, go to **Settings → API keys** and create a key with the least-privilege `org:*` scopes you need — the secret (`eb_sk_…`) is shown once. Export it rather than hard-coding it:

```sh
export ENTRYBIT_API_KEY="eb_sk_..."
```

Then list your members and create a guest pass:

```ts
import { EntryBit } from "@entrybit/sdk";

const entrybit = new EntryBit({ apiKey: process.env.ENTRYBIT_API_KEY! });

// Walk the whole member directory (cursor pagination handled for you).
for await (const member of entrybit.org.members.iterate({ fields: ["name", "department"] })) {
  console.log(member.name, "—", member.department ?? "no department");
}

// Create a guest pass — the guest receives it by email and/or SMS.
const created = await entrybit.org.passes.create({
  first_name: "Dana",
  last_name: "Levy",
  email: "dana@example.com",
  arrival_date: "2026-08-12",
  arrival_time: "14:30",
  facility_id: 1,
});
console.log("Pass created:", created.public_id, created.pass_link);
```

### Available resources

Namespaces mirror the API paths under `/api/v1`:

| Namespace | Endpoint | Auth |
| --- | --- | --- |
| `entrybit.passes` | `/api/v1/passes` — your own guest passes: `list`, `iterate`, `get`, `create`, `revoke` | OAuth token |
| `entrybit.org.passes` | `/api/v1/org/passes` — organization-wide passes: `list`, `iterate`, `create`, `revoke` | API key |
| `entrybit.org.members` | `/api/v1/org/members` — member directory: `list`, `iterate`, `get` | API key or OAuth token |
| `entrybit.org.facilities` | `/api/v1/org/facilities` — `list` | API key |
| `entrybit.me` | `/api/v1/me` — the authenticated member: `get` | OAuth token |
| `entrybit.invites` | `/api/v1/invites` — pending invites: `list` | OAuth token |
| `entrybit.facilities` | `/api/v1/facilities` — facilities you may invite guests to: `list` | OAuth token |

## Authentication

The client supports exactly one auth mode at a time (configuring more than one throws).

### Organization API key (server-to-server)

Created in **Settings → API keys**; carries `org:*` scopes, an optional expiry, and an optional source-IP allowlist. Sent as `Authorization: Bearer` by default; use the `X-API-Key` header if a proxy in your stack reserves `Authorization`:

```ts
const entrybit = new EntryBit({ apiKey: process.env.ENTRYBIT_API_KEY! });
// or
const entrybit = new EntryBit({
  apiKey: process.env.ENTRYBIT_API_KEY!,
  apiKeyHeader: "x-api-key",
});
```

### OAuth2 access token (user-delegated)

For apps acting on behalf of an EntryBit user (authorization-code flow with PKCE — see the [OAuth guide](https://docs.entrybit.net)). Pass a static token, or a callback so the SDK always uses your freshest token:

```ts
const entrybit = new EntryBit({ accessToken: token });
// or, if your app refreshes tokens:
const entrybit = new EntryBit({ getAccessToken: async () => tokenStore.current() });
```

### Scopes

Delegated (OAuth) scopes:

| Scope | Grants |
| --- | --- |
| `openid` / `profile` / `email` | Identity claims |
| `offline_access` | Refresh token |
| `passes:read` | View your guest passes and facilities |
| `passes:write` | Create and revoke your guest passes |
| `invites:read` | View invitations addressed to you |
| `member:read` | Your member profile, organization and apartment details |
| `members:read` | View your organization's member directory (contact tier) |

Organization API-key scopes are selected when creating the key in **Settings → API keys** (least privilege), including:

| Scope | Grants |
| --- | --- |
| `org:passes:write` | Create and revoke organization guest passes |
| `org:members:read` | Member directory, basic tier |
| `org:members:contact:read` | Member directory, adds `email` and `phone` |

See the [API reference](https://docs.entrybit.net) for the complete, current list.

## Pagination

List endpoints use keyset (cursor) pagination: each page returns `next_cursor` and `has_more`. `list()` gives you one page; `iterate()` walks all of them:

```ts
// One page at a time:
const page = await entrybit.org.members.list({ limit: 100 });
if (page.has_more) {
  const next = await entrybit.org.members.list({ limit: 100, cursor: page.next_cursor! });
}

// Or let the SDK follow cursors:
for await (const member of entrybit.org.members.iterate({ status: "active" })) {
  // ...
}
```

The member directory supports field selection — pass an array (serialized as a comma-separated `fields=` parameter):

```ts
const page = await entrybit.org.members.list({ fields: ["name", "email", "phone"] });
```

Which fields come back also depends on your credential's tier: the basic tier returns identity and role fields; `org:members:contact:read` (or any delegated `members:read` token) adds `email` and `phone`.

## Error handling

Every failure throws a typed subclass of `EntryBitError`:

```ts
import {
  AuthenticationError,
  PermissionError,
  RateLimitError,
  ValidationError,
  APIError,
} from "@entrybit/sdk";

try {
  await entrybit.org.members.list({ fields: ["email"] });
} catch (err) {
  if (err instanceof PermissionError) {
    console.error("Key is missing scope:", err.missingScope); // e.g. "org:members:contact:read"
  } else if (err instanceof RateLimitError) {
    console.error("Rate limited; retry in", err.retryAfter, "seconds");
  } else if (err instanceof AuthenticationError) {
    console.error("Invalid or expired credential");
  } else if (err instanceof ValidationError) {
    console.error("Bad request:", err.message);
  } else if (err instanceof APIError) {
    console.error("API error", err.status, err.body);
  } else {
    throw err;
  }
}
```

| Class | HTTP | Extras |
| --- | --- | --- |
| `AuthenticationError` | 401 | RFC 6750 `invalid_token` |
| `PermissionError` | 403 | `missingScope` parsed from `WWW-Authenticate` |
| `RateLimitError` | 429 | `retryAfter` (seconds, from `Retry-After`) |
| `ValidationError` | 400 | server message |
| `APIError` | other non-2xx | `status`, `code`, `body` |
| `ConnectionError` | — | no HTTP response (network failure, timeout) |

All of them expose `status`, `code`, `body`, and `headers` where available.

## Retries & timeouts

Idempotent `GET` requests are automatically retried on `429` and `5xx` with exponential backoff and jitter, honoring `Retry-After`. Writes are never retried by default. Each attempt is subject to a per-request timeout (30 seconds by default); a request that never produces a response throws `ConnectionError`:

```ts
const entrybit = new EntryBit({
  apiKey: process.env.ENTRYBIT_API_KEY!,
  maxRetries: 3, // default 2; 0 disables retries
  timeoutMs: 10_000, // default 30_000
});
```

## Configuration

All client options:

| Option | Default | Description |
| --- | --- | --- |
| `apiKey` | — | Organization API key (`eb_sk_…`). Mutually exclusive with the token options. |
| `apiKeyHeader` | `"authorization"` | How the key is sent: `Authorization: Bearer` or `X-API-Key`. |
| `accessToken` | — | Static user-delegated OAuth2 access token. |
| `getAccessToken` | — | Callback returning a fresh access token before each request. |
| `baseUrl` | `https://api.entrybit.net` | API origin; override for testing. |
| `maxRetries` | `2` | Retry attempts after the first try, for eligible requests. `0` disables. |
| `timeoutMs` | `30_000` | Per-request timeout in milliseconds. |
| `fetch` | `globalThis.fetch` | Custom `fetch` implementation. |
| `defaultHeaders` | `{}` | Extra headers sent with every request. |

For example, to point the client at a local server:

```ts
const entrybit = new EntryBit({ baseUrl: "http://localhost:8001" });
```

## Development

```sh
npm ci             # install
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm test           # vitest
npm run build      # tsup (ESM + CJS)
```

`src/generated/schema.d.ts` is generated from the committed `spec/openapi.json` and checked for drift in CI:

```sh
npm run generate     # regenerate types from the committed spec
npm run regenerate   # refetch the published spec, then regenerate
```

Every code sample in this README is transcribed in `test/readme-samples.ts` and typechecked in CI, so samples cannot silently drift from the exported types.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for local setup, the development workflow, and pull request expectations. Report security issues per [SECURITY.md](./SECURITY.md) — never in public issues.

## License

Copyright EntryBit. Released under the [MIT License](./LICENSE).
