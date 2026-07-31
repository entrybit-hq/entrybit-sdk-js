/**
 * Compile-only transcription of the code samples in README.md.
 *
 * This file is typechecked by `tsc --noEmit` (and linted) but never executed —
 * it exists so that a README snippet that drifts from the real exported types
 * fails CI. Keep each block in sync with the corresponding README section.
 */
import {
  EntryBit,
  EntryBitError,
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

// README § Debugging — request IDs on errors
export async function requestIdsOnErrors(entrybit: EntryBit): Promise<void> {
  try {
    await entrybit.passes.get("gst_missing");
  } catch (err) {
    if (err instanceof EntryBitError) {
      console.error(err.message); // "Pass not found (request id: req_abc123)"
      console.error(err.requestId); // "req_abc123"
    }
  }
}

// README § Debugging — requestWithMeta
export async function requestIdsOnSuccesses(entrybit: EntryBit): Promise<void> {
  const { data, requestId, status } = await entrybit.requestWithMeta<{ items: unknown[] }>({
    method: "GET",
    path: "/api/v1/org/passes",
  });
  void data;
  void requestId;
  void status;
}

// README § Debugging — request/response events
export function responseEvents(entrybit: EntryBit): void {
  entrybit.on("response", (e) => {
    console.log(`${e.method} ${e.path} -> ${e.status} in ${e.durationMs}ms (${e.requestId})`);
    if (e.willRetry) console.warn(`retrying attempt ${e.attempt + 1}`);
  });
}

// README § Debugging — debugInfo()
export function debugSnapshot(entrybit: EntryBit): void {
  console.log(entrybit.debugInfo());
}

// README § Pass display & templates
export async function passDisplayAndTemplates(entrybit: EntryBit): Promise<void> {
  const created = await entrybit.org.passes.create({
    first_name: "Dana",
    phone: "0501234567",
    arrival_date: "2026-08-12",
    facility_id: 1,
    template: "pool-guest", // start from a named preset…
    display: { print: false, language: "he" }, // …and override per pass
  });
  console.log(created.display_applied); // what the guest's pass page will actually use

  await entrybit.org.passTemplates.upsert("pool-guest", {
    show_code: false,
    welcome_message: "Welcome! Show the QR at the pool gate.",
  });
  const templates = await entrybit.org.passTemplates.list();
  void templates;
}

// README § Access control
export async function accessControl(entrybit: EntryBit): Promise<void> {
  const controllers = await entrybit.org.controllers.list();
  const online = controllers.find((c) => c.online);
  const door = online?.doors?.find((d) => d.openable);

  if (online?.sn && door?.door_no != null) {
    const res = await entrybit.org.doors.open({ controller_sn: online.sn, door_no: door.door_no });
    console.log(res.status); // "sent" — written to the controller, NOT "opened"
  }

  await entrybit.org.relays.open({ controller_sn: "EB123456", relay_no: 0, duration: 10 });
}
