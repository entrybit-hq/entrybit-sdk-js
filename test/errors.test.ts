import { describe, expect, it } from "vitest";
import {
  APIError,
  AuthenticationError,
  EntryBit,
  PermissionError,
  RateLimitError,
  ValidationError,
} from "../src/index.js";
import { mockFetch } from "./helpers.js";

function client(fn: typeof globalThis.fetch) {
  // maxRetries: 0 so error mapping is observed directly.
  return new EntryBit({ apiKey: "eb_sk_test", fetch: fn, maxRetries: 0 });
}

describe("error mapping", () => {
  it("maps 401 invalid_token to AuthenticationError", async () => {
    const { fn } = mockFetch({ status: 401, body: { error: "invalid_token" } });
    const err = await client(fn).passes.list().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthenticationError);
    expect((err as AuthenticationError).status).toBe(401);
    expect((err as AuthenticationError).code).toBe("invalid_token");
  });

  it("maps 403 insufficient_scope to PermissionError and parses missingScope from WWW-Authenticate", async () => {
    const { fn } = mockFetch({
      status: 403,
      body: { error: "insufficient_scope" },
      headers: {
        "WWW-Authenticate":
          'Bearer realm="entrybit", error="insufficient_scope", error_description="The token is missing a required scope", scope="org:members:contact:read"',
      },
    });
    const err = await client(fn).org.members.list().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PermissionError);
    expect((err as PermissionError).missingScope).toBe("org:members:contact:read");
    expect((err as PermissionError).status).toBe(403);
  });

  it("leaves missingScope undefined when the challenge names no scope", async () => {
    const { fn } = mockFetch({
      status: 403,
      body: { error: "insufficient_scope" },
      headers: { "WWW-Authenticate": 'Bearer error="insufficient_scope"' },
    });
    const err = await client(fn).org.members.list().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PermissionError);
    expect((err as PermissionError).missingScope).toBeUndefined();
  });

  it("maps 400 to ValidationError with the server message", async () => {
    const { fn } = mockFetch({
      status: 400,
      body: { success: false, error: "arrival_date is required" },
    });
    const err = await client(fn)
      .org.passes.create({ first_name: "A", arrival_date: "", facility_id: 1 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).message).toContain("arrival_date is required");
  });

  it("maps 429 to RateLimitError carrying retryAfter seconds", async () => {
    const { fn } = mockFetch({ status: 429, body: {}, headers: { "Retry-After": "17" } });
    const err = await client(fn).org.members.list().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).retryAfter).toBe(17);
  });

  it("maps other statuses (404, 409) to APIError with body attached", async () => {
    const { fn } = mockFetch({
      status: 409,
      body: { success: false, code: "ALREADY_CHECKED_IN", message: "Pass already used" },
    });
    const err = await client(fn).org.passes.revoke("gst_x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(APIError);
    expect((err as APIError).status).toBe(409);
    expect((err as APIError).code).toBe("ALREADY_CHECKED_IN");
    expect((err as APIError).body).toMatchObject({ code: "ALREADY_CHECKED_IN" });
  });
});
