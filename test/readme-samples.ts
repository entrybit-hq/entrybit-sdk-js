/**
 * Compile-only transcription of the code samples in README.md.
 *
 * This file is typechecked by `tsc --noEmit` (and linted) but never executed —
 * it exists so that a README snippet that drifts from the real exported types
 * fails CI. Keep each block in sync with the corresponding README section.
 */
import {
  EntryBit,
  AuthenticationError,
  PermissionError,
  NotFoundError,
  RateLimitError,
  ValidationError,
  APIError,
} from "../src/index.js";

declare const tokenStore: { current(): string };
declare const token: string;
declare const code: string;
declare const verifier: string;
declare const traceId: string;

// README § Usage
export async function quickstart(): Promise<void> {
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
}

// README § Available resources — the request() escape hatch
export async function escapeHatch(entrybit: EntryBit): Promise<void> {
  const raw = await entrybit.request<{ success: boolean }>({
    method: "GET",
    path: "/api/v1/org/passes",
    query: { limit: 5 },
  });
  void raw;
}

// README § Authentication
export function authModes(): EntryBit[] {
  return [
    new EntryBit({ apiKey: process.env.ENTRYBIT_API_KEY! }),
    new EntryBit({
      apiKey: process.env.ENTRYBIT_API_KEY!,
      apiKeyHeader: "x-api-key",
    }),
    new EntryBit({ accessToken: token }),
    new EntryBit({ getAccessToken: async () => tokenStore.current() }),
  ];
}

// README § Authentication — the oauth namespace
export async function oauthLifecycle(entrybit: EntryBit): Promise<void> {
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
  void fresh;
}

// README § Retries & timeouts
export function retriesAndTimeouts(): EntryBit {
  return new EntryBit({
    apiKey: process.env.ENTRYBIT_API_KEY!,
    maxRetries: 3, // default 2; 0 disables retries
    timeoutMs: 10_000, // default 30_000
  });
}

// README § Per-request options
export async function perRequestOptions(entrybit: EntryBit): Promise<void> {
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
  void page;
}

// README § Configuration — pointing the client at a local server
export function baseUrlOverride(): EntryBit {
  return new EntryBit({ apiKey: null, baseUrl: "http://localhost:8001" });
}

// README § Privacy — disabling telemetry
export function telemetryOptOut(): EntryBit {
  return new EntryBit({ apiKey: process.env.ENTRYBIT_API_KEY!, telemetry: false });
}

// README § Pagination
export async function pagination(entrybit: EntryBit): Promise<void> {
  // One page at a time:
  const page = await entrybit.org.members.list({ limit: 100 });
  if (page.has_more) {
    const next = await entrybit.org.members.list({ limit: 100, cursor: page.next_cursor! });
    void next;
  }

  // Or let the SDK follow cursors:
  for await (const member of entrybit.org.members.iterate({ status: "active" })) {
    void member;
  }

  const fieldsPage = await entrybit.org.members.list({ fields: ["name", "email", "phone"] });
  void fieldsPage;
}

// README § Error handling
export async function errorHandling(entrybit: EntryBit): Promise<void> {
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
}

// README § Requirements — bring-your-own-fetch
export function customFetch(myFetch: typeof globalThis.fetch): EntryBit {
  return new EntryBit({ fetch: myFetch });
}
