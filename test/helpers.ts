import { vi } from "vitest";

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export interface MockResponseSpec {
  status?: number;
  body?: unknown;
  /** Raw response body; takes precedence over `body` (which is JSON-encoded). */
  rawBody?: string | ReadableStream<Uint8Array> | null;
  headers?: Record<string, string>;
}

/**
 * A queued mock `fetch`: each call consumes the next spec (the last spec
 * repeats). Records every request for assertions.
 */
export function mockFetch(...specs: MockResponseSpec[]) {
  const requests: RecordedRequest[] = [];
  let call = 0;
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    requests.push({
      url,
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    const spec = specs[Math.min(call, specs.length - 1)] ?? {};
    call += 1;
    const status = spec.status ?? 200;
    const body =
      spec.rawBody !== undefined
        ? spec.rawBody
        : spec.body === undefined
          ? null
          : JSON.stringify(spec.body);
    return new Response(status === 204 ? null : body, {
      status,
      headers: { "Content-Type": "application/json", ...spec.headers },
    });
  });
  return { fn: fn as unknown as typeof globalThis.fetch, requests, spy: fn };
}
