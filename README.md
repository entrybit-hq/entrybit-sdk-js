# EntryBit Node.js SDK

[![npm version](https://img.shields.io/npm/v/%40entrybit%2Fsdk.svg)](https://www.npmjs.com/package/@entrybit/sdk)
[![CI](https://github.com/entrybit-hq/entrybit-sdk-js/actions/workflows/ci.yml/badge.svg)](https://github.com/entrybit-hq/entrybit-sdk-js/actions/workflows/ci.yml)

The official TypeScript SDK for the [EntryBit API](https://docs.entrybit.net) — guest passes, the organization member directory, facilities, and OAuth.

- Typed end to end: generated from the published [OpenAPI 3.1 spec](https://docs.entrybit.net/openapi.json), with an ergonomic handwritten layer on top.
- Ships ESM and CommonJS builds with full type definitions.
- Zero runtime dependencies.

## Requirements

Node.js 20.19 or later (the SDK uses the built-in `fetch`). Other runtimes — Cloudflare Workers, Deno, edge functions — work wherever a WHATWG `fetch` is available, or pass your own via `new EntryBit({ fetch })`. TypeScript 5.1 or later for the bundled types.

## Installation

```sh
npm install @entrybit/sdk
```

## Usage

The client needs a credential for your organization. In the EntryBit console, go to **Settings → API keys** and create a key with the least-privilege `org:*` scopes you need — the secret (`eb_sk_…`) is shown once. Export it rather than hard-coding it:

```sh
export ENTRYBIT_API_KEY="eb_sk_..."
```

The client reads `ENTRYBIT_API_KEY` automatically. Then list your members and create a guest pass:

```ts
import { EntryBit } from "@entrybit/sdk";

const entrybit = new EntryBit(); // uses ENTRYBIT_API_KEY

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

Runnable examples live in [`examples/`](./examples).

### Available resources

Namespaces mirror the API paths:

| Namespace                 | Endpoint                                                                               | Auth                                  |
| ------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------- |
| `entrybit.passes`         | `/api/v1/passes` — your own guest passes: `list`, `iterate`, `get`, `create`, `revoke` | OAuth token                           |
| `entrybit.org.passes`     | `/api/v1/org/passes` — organization-wide passes: `list`, `iterate`, `create`, `revoke` | API key                               |
| `entrybit.org.members`    | `/api/v1/org/members` — member directory: `list`, `iterate`, `get`                     | API key or OAuth token                |
| `entrybit.org.facilities` | `/api/v1/org/facilities` — `list`                                                      | API key                               |
| `entrybit.me`             | `/api/v1/me` — the authenticated member: `get`                                         | OAuth token                           |
| `entrybit.invites`        | `/api/v1/invites` — pending invites: `list`                                            | OAuth token                           |
| `entrybit.facilities`     | `/api/v1/facilities` — facilities you may invite guests to: `list`                     | OAuth token                           |
| `entrybit.oauth`          | `/api/oauth/*` — `exchangeCode`, `refresh`, `revoke`, `introspect`, `userinfo`         | Body params (`userinfo`: OAuth token) |

For endpoints the typed surface does not model yet, `entrybit.request()` sends a request through the same auth/retry/error pipeline:

```ts
const raw = await entrybit.request<{ success: boolean }>({
  method: "GET",
  path: "/api/v1/org/passes",
  query: { limit: 5 },
});
```

## Authentication

The client supports exactly one auth mode at a time (configuring more than one throws). With no mode configured it falls back to the `ENTRYBIT_API_KEY` environment variable, and throws a descriptive error if that is unset too — pass `apiKey: null` to explicitly create an unauthenticated client (say, against a local mock server).

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

API keys are secrets: the client refuses to run with one in a browser-like environment (use user-delegated OAuth tokens there; `dangerouslyAllowBrowser: true` overrides at your own risk).

### OAuth2 access token (user-delegated)

For apps acting on behalf of an EntryBit user (authorization-code flow with PKCE — see the [OAuth guide](https://docs.entrybit.net)). Pass a static token, or a callback so the SDK always uses your freshest token (it is invoked per attempt and single-flighted across concurrent requests):

```ts
const entrybit = new EntryBit({ accessToken: token });
// or, if your app refreshes tokens:
const entrybit = new EntryBit({ getAccessToken: async () => tokenStore.current() });
```

The `entrybit.oauth` namespace covers the token lifecycle itself — exchanging the authorization code, refreshing (refresh tokens rotate on every use), revocation, introspection, and OIDC UserInfo:

```ts
const tokens = await entrybit.oauth.exchangeCode({
  code,
  redirectUri: "https://app.example.com/callback",
  codeVerifier: verifier,
  clientId: process.env.ENTRYBIT_CLIENT_ID!,
});
const fresh = await entrybit.oauth.refresh({
  refreshToken: tokens.refresh_token!,
  clientId: process.env.ENTRYBIT_CLIENT_ID!,
});
```

### Scopes

Delegated (OAuth) scopes:

| Scope                          | Grants                                                   |
| ------------------------------ | -------------------------------------------------------- |
| `openid` / `profile` / `email` | Identity claims                                          |
| `offline_access`               | Refresh token                                            |
| `passes:read`                  | View your guest passes and facilities                    |
| `passes:write`                 | Create and revoke your guest passes                      |
| `invites:read`                 | View invitations addressed to you                        |
| `member:read`                  | Your member profile, organization and apartment details  |
| `members:read`                 | View your organization's member directory (contact tier) |

Organization API-key scopes are selected when creating the key in **Settings → API keys** (least privilege), including:

| Scope                      | Grants                                      |
| -------------------------- | ------------------------------------------- |
| `org:passes:read`          | List organization guest passes              |
| `org:passes:write`         | Create and revoke organization guest passes |
| `org:members:read`         | Member directory, basic tier                |
| `org:members:contact:read` | Member directory, adds `email` and `phone`  |
| `org:facilities:read`      | List organization facilities                |

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
  NotFoundError,
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
    console.error("Rate limited; retry in", err.retryAfter ?? "a few", "seconds");
  } else if (err instanceof AuthenticationError) {
    console.error("Invalid or expired credential");
  } else if (err instanceof ValidationError) {
    console.error("Bad request:", err.message);
  } else if (err instanceof NotFoundError) {
    console.error("No such resource");
  } else if (err instanceof APIError) {
    console.error("API error", err.status, err.body);
  } else {
    throw err;
  }
}
```

| Class                      | HTTP          | Extras                                                                  |
| -------------------------- | ------------- | ----------------------------------------------------------------------- |
| `AuthenticationError`      | 401           | RFC 6750 `invalid_token`                                                |
| `PermissionError`          | 403           | `missingScope` parsed from `WWW-Authenticate`                           |
| `NotFoundError`            | 404           | subclass of `APIError`                                                  |
| `ConflictError`            | 409           | subclass of `APIError`                                                  |
| `RateLimitError`           | 429           | `retryAfter` (seconds, from `Retry-After` — not sent by every endpoint) |
| `ValidationError`          | 400           | server message                                                          |
| `UnprocessableEntityError` | 422           | subclass of `ValidationError`                                           |
| `InternalServerError`      | 5xx           | subclass of `APIError`                                                  |
| `APIError`                 | other non-2xx | `status`, `code`, `body`                                                |
| `TimeoutError`             | —             | `timeoutMs` elapsed; subclass of `ConnectionError`                      |
| `ConnectionError`          | —             | no HTTP response (network failure)                                      |
| `UserAbortError`           | —             | your `AbortSignal` fired; never retried                                 |

All of them expose `status`, `code`, `body`, and `headers` where available, plus `requestId` — the API's `x-request-id` echo, also appended to the message — whenever the response carried one (see [Debugging](#debugging)).

## Retries & timeouts

Idempotent `GET` requests are automatically retried on `429`, `5xx` and network failures with exponential backoff and jitter, honoring `Retry-After` up to a 30-second cap — beyond the cap the error is surfaced immediately with the unclamped `retryAfter`. Writes (including revokes) are never retried automatically. Each attempt is subject to a per-request timeout (30 seconds by default):

```ts
const entrybit = new EntryBit({
  apiKey: process.env.ENTRYBIT_API_KEY!,
  maxRetries: 3, // default 2; 0 disables retries
  timeoutMs: 10_000, // default 30_000
});
```

### Per-request options

Every method accepts a trailing options argument to cancel, re-time, or decorate a single call:

```ts
const controller = new AbortController();
const page = await entrybit.org.members.list(
  { limit: 100 },
  {
    signal: controller.signal, // cancel from your side (throws UserAbortError)
    timeoutMs: 5_000, // override the client default for this call
    maxRetries: 0, // and the retry budget
    headers: { "x-trace-id": traceId }, // extra headers for this call
  },
);
```

## Debugging

Everything here exists for support-ticket correlation and production observability — and none of it ever includes request headers or bodies.

### Request IDs

Errors expose the API's `x-request-id` echo as `err.requestId` and append it to the message, so a bare stack trace in a log aggregator is already support-ready:

```ts
try {
  await entrybit.passes.get("gst_missing");
} catch (err) {
  if (err instanceof EntryBitError) {
    console.error(err.message); // "Pass not found (request id: req_abc123)"
    console.error(err.requestId); // "req_abc123"
  }
}
```

For successful calls, `requestWithMeta()` is the metadata-carrying sibling of the `request()` escape hatch:

```ts
const { data, requestId, status } = await entrybit.requestWithMeta<{ items: unknown[] }>({
  method: "GET",
  path: "/api/v1/org/passes",
});
```

### Request/response events

Subscribe to per-attempt lifecycle events for metrics and tracing. `"request"` fires once per HTTP attempt; `"response"` fires once per HTTP response — including responses the SDK is about to retry (`willRetry: true`). Requests that fail before response headers arrive (network failure, timeout, abort mid-connect) emit no `"response"` event; once headers have been received the event fires even if the body read then fails. Listener failures — synchronous throws and async rejections alike — are swallowed: an observer can never fail a request.

```ts
entrybit.on("response", (e) => {
  console.log(`${e.method} ${e.path} -> ${e.status} in ${e.durationMs}ms (${e.requestId})`);
  if (e.willRetry) console.warn(`retrying attempt ${e.attempt + 1}`);
});
```

### Logging

`logLevel: "info"` logs retry decisions; `"debug"` adds one line per response (method, path, status, duration, request id). Set the `ENTRYBIT_LOG` environment variable to change the level of a deployed binary without a code change — an explicit `logLevel` option always wins:

```sh
ENTRYBIT_LOG=debug node app.js
```

The `logger` option routes lines into pino, winston, consola or anything else with `error`/`warn`/`info`/`debug` methods.

### `debugInfo()` and build provenance

`entrybit.debugInfo()` returns a paste-into-a-bug-report snapshot: SDK version, the git commit the bundle was built from, resolved configuration and runtime facts. It names the auth _mode_ but never contains credential values:

```ts
console.log(entrybit.debugInfo());
// {
//   name: "@entrybit/sdk",
//   version: "0.2.1",
//   buildSha: "abc123456789",   // "dev" when running from source
//   userAgent: "entrybit-sdk-js/0.2.1",
//   baseUrl: "https://api.entrybit.net",
//   authMode: "apiKey",
//   maxRetries: 2,
//   timeoutMs: 30000,
//   ...
// }
```

The same provenance is exported as constants — `VERSION` and `BUILD_SHA` — and rides in the `x-entrybit-client` header (`entrybit-sdk-js/0.2.1+abc123456789 …`) so support can see exactly which build produced a request.

## Configuration

All client options:

| Option                    | Default                    | Description                                                                                                                |
| ------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `apiKey`                  | `ENTRYBIT_API_KEY` env var | Organization API key (`eb_sk_…`). `null` = explicitly unauthenticated. Mutually exclusive with the token options.          |
| `apiKeyHeader`            | `"authorization"`          | How the key is sent: `Authorization: Bearer` or `X-API-Key`.                                                               |
| `accessToken`             | —                          | Static user-delegated OAuth2 access token.                                                                                 |
| `getAccessToken`          | —                          | Callback returning a fresh access token (called per attempt, single-flighted).                                             |
| `baseUrl`                 | `https://api.entrybit.net` | API origin; override for testing.                                                                                          |
| `maxRetries`              | `2`                        | Retry attempts after the first try, for eligible requests. `0` disables.                                                   |
| `timeoutMs`               | `30_000`                   | Per-request timeout in milliseconds.                                                                                       |
| `fetch`                   | `globalThis.fetch`         | Custom `fetch` implementation.                                                                                             |
| `fetchOptions`            | —                          | Extra `RequestInit` fields for every call (e.g. an undici `dispatcher` for proxies/keep-alive).                            |
| `defaultHeaders`          | `{}`                       | Extra headers sent with every request (case-insensitive).                                                                  |
| `telemetry`               | `true`                     | Send the `x-entrybit-client` runtime header. `false` omits it entirely.                                                    |
| `dangerouslyAllowBrowser` | `false`                    | Allow an API key in a browser-like environment.                                                                            |
| `logger` / `logLevel`     | `console` / `"warn"`       | `"info"` logs retry decisions, `"debug"` logs each request — never headers or bodies. Default level honors `ENTRYBIT_LOG`. |
| `appInfo`                 | —                          | `{ name, version?, url? }` identifying your integration in the `User-Agent` and telemetry headers.                         |

For example, to point the client at a local server:

```ts
const entrybit = new EntryBit({ apiKey: null, baseUrl: "http://localhost:8001" });
```

## Performance & footprint

The SDK is built to disappear in your dependency tree and your flame graphs:

- **Zero runtime dependencies** — the tarball ships `dist/` and docs, nothing else, and the only platform requirement is WHATWG `fetch`.
- **A few KB gzipped** — enforced by a size budget in CI (`npm run size`), so it can only shrink or grow deliberately. `sideEffects: false` and dual ESM/CJS keep it fully tree-shakable.
- **Lazy everywhere** — resource namespaces (`passes`, `org`, `oauth`, …) are constructed on first access; the event emitter only materializes when a listener registers.
- **Pay-for-use observability** — with no listeners and `logLevel` below `"debug"`, the request hot path allocates no event payloads and builds no log strings.
- **Measured, not asserted** — `npm run bench` compares `entrybit.passes.list()` against a raw `fetch` + `JSON.parse` baseline on your machine; the delta is the SDK's whole overhead (auth headers, retries, timeout plumbing, error mapping).

## Privacy — exactly what the SDK sends

The SDK talks only to your configured `baseUrl` (redirects are treated as errors, so a request can never be forwarded elsewhere). Beyond your request data and credential, it adds two headers:

| Header              | Content                                                                                                                                                                                         | Control                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `User-Agent`        | `entrybit-sdk-js/<version>` — SDK version, plus your `appInfo` when configured                                                                                                                  | Override via `defaultHeaders`   |
| `x-entrybit-client` | SDK version + build commit, runtime version, OS/arch, plus your `appInfo` when configured (e.g. `entrybit-sdk-js/0.2.1+abc123456789 node/22.14.0 (linux; x64)`) — used to triage support issues | Disable with `telemetry: false` |

There is no other telemetry of any kind: no analytics, no phone-home, no error reporting. Log output (`logLevel`) never includes headers or bodies, and SDK errors never carry your request credentials — only response data:

```ts
const entrybit = new EntryBit({ apiKey: process.env.ENTRYBIT_API_KEY!, telemetry: false });
```

## Development

```sh
npm ci                 # install
npm run typecheck      # tsc --noEmit
npm run lint           # eslint (type-aware)
npm run format         # prettier --write
npm run format:check   # prettier --check (enforced in CI)
npm test               # vitest
npm run test:coverage  # vitest + enforced coverage thresholds
npm run build          # tsup (ESM + CJS)
npm run size           # gzip size budget on dist/ (enforced in CI)
npm run bench          # micro-benchmarks (local only)
npm run check:exports  # publint + arethetypeswrong on the packed tarball
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
