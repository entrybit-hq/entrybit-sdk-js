import { describe, expect, it, vi } from "vitest";
import {
  APIError,
  AuthenticationError,
  ConflictError,
  EntryBit,
  InternalServerError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  UnprocessableEntityError,
  ValidationError,
} from "../src/index.js";
import { parseRetryAfter } from "../src/errors/index.js";
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

  it("maps 404 to NotFoundError (still an APIError for legacy handling)", async () => {
    const { fn } = mockFetch({ status: 404, body: { success: false, error: "Pass not found" } });
    const err = await client(fn).passes.get("gst_missing").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err).toBeInstanceOf(APIError);
    expect((err as NotFoundError).status).toBe(404);
  });

  it("maps 409 to ConflictError (still an APIError) with body attached", async () => {
    const { fn } = mockFetch({
      status: 409,
      body: { success: false, code: "ALREADY_CHECKED_IN", message: "Pass already used" },
    });
    const err = await client(fn).org.passes.revoke("gst_x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err).toBeInstanceOf(APIError);
    expect((err as ConflictError).status).toBe(409);
    expect((err as ConflictError).code).toBe("ALREADY_CHECKED_IN");
    expect((err as ConflictError).body).toMatchObject({ code: "ALREADY_CHECKED_IN" });
  });

  it("maps 422 to UnprocessableEntityError, catchable as ValidationError", async () => {
    const { fn } = mockFetch({
      status: 422,
      body: { success: false, error: "Validation failed", code: "validation_error" },
    });
    const err = await client(fn).org.members.list({ limit: 200 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnprocessableEntityError);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as UnprocessableEntityError).status).toBe(422);
  });

  it("maps 5xx to InternalServerError (still an APIError)", async () => {
    const { fn } = mockFetch({ status: 500, body: { success: false, error: "boom" } });
    const err = await client(fn).passes.list().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InternalServerError);
    expect(err).toBeInstanceOf(APIError);
    expect((err as InternalServerError).status).toBe(500);
  });

  it("maps 429 to RateLimitError carrying retryAfter seconds", async () => {
    const { fn } = mockFetch({ status: 429, body: {}, headers: { "Retry-After": "17" } });
    const err = await client(fn).org.members.list().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).retryAfter).toBe(17);
  });

  it("maps other statuses (402) to plain APIError", async () => {
    const { fn } = mockFetch({ status: 402, body: { success: false, code: "CAPACITY_EXCEEDED" } });
    const err = await client(fn)
      .org.passes.create({ first_name: "A", arrival_date: "2026-08-01", facility_id: 1 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(APIError);
    expect(err).not.toBeInstanceOf(InternalServerError);
    expect((err as APIError).status).toBe(402);
  });
});

describe("parseRetryAfter", () => {
  it("parses delta-seconds", () => {
    expect(parseRetryAfter("0")).toBe(0);
    expect(parseRetryAfter("17")).toBe(17);
    expect(parseRetryAfter(" 4 ")).toBe(4);
  });

  it("parses an HTTP-date relative to now, clamping past dates to 0", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-30T12:00:00Z"));
      expect(parseRetryAfter(new Date("2026-07-30T12:00:30Z").toUTCString())).toBe(30);
      expect(parseRetryAfter(new Date("2026-07-30T11:59:00Z").toUTCString())).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats malformed values as absent", () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("")).toBeUndefined();
    expect(parseRetryAfter("   ")).toBeUndefined();
    expect(parseRetryAfter("soon")).toBeUndefined();
    expect(parseRetryAfter("-5")).toBeUndefined();
  });
});
