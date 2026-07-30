import { VERSION } from "../version.js";

export const USER_AGENT = `entrybit-sdk-js/${VERSION}`;

/**
 * Telemetry header for support triage (`User-Agent` is a forbidden header in
 * browsers, so the runtime details ride on a custom header that survives
 * everywhere). Contains only the SDK version, runtime version and OS/arch —
 * never user data — and can be disabled with the `telemetry: false` client
 * option.
 */
export const CLIENT_TELEMETRY_HEADER = "x-entrybit-client";

function runtimeProcess():
  | {
      env?: Record<string, string | undefined>;
      versions?: { node?: string };
      platform?: string;
      arch?: string;
    }
  | undefined {
  return (globalThis as { process?: ReturnType<typeof runtimeProcess> }).process;
}

export function clientTelemetry(): string {
  const proc = runtimeProcess();
  const node = proc?.versions?.node;
  const runtime = node ? ` node/${node}` : "";
  const platform = proc?.platform && proc.arch ? ` (${proc.platform}; ${proc.arch})` : "";
  return `${USER_AGENT}${runtime}${platform}`;
}

export function readEnvApiKey(): string | undefined {
  const value = runtimeProcess()?.env?.ENTRYBIT_API_KEY;
  return value && value.trim() ? value : undefined;
}

export function isBrowserLike(): boolean {
  const w = (globalThis as { window?: { document?: unknown } }).window;
  return (
    typeof w === "object" && w !== null && typeof w.document === "object" && w.document !== null
  );
}
