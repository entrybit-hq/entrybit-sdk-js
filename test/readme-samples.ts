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
  RateLimitError,
  ValidationError,
  APIError,
} from "../src/index.js";

declare const tokenStore: { current(): string };
declare const token: string;

// README § 5-minute quickstart
export async function quickstart(): Promise<void> {
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
    new EntryBit({ baseUrl: "http://localhost:8001" }),
  ];
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
}

// README § Requirements — bring-your-own-fetch
export function customFetch(myFetch: typeof globalThis.fetch): EntryBit {
  return new EntryBit({ fetch: myFetch });
}
