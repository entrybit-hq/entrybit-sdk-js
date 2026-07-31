import type { AppInfo, LogLevel } from "../types/client.js";
import { BUILD_SHA, VERSION } from "../version.js";

export const USER_AGENT = `entrybit-sdk-js/${VERSION}`;

/**
 * Telemetry header for support triage (`User-Agent` is a forbidden header in
 * browsers, so the runtime details ride on a custom header that survives
 * everywhere). Contains only the SDK version + build commit, runtime version,
 * OS/arch and any `appInfo` the integrator configured — never user data —
 * and can be disabled with the `telemetry: false` client option.
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

/** Formats appInfo for header values: `my-app/1.2.0 (https://example.com)`. */
export function formatAppInfo(appInfo: AppInfo): string {
  const version = appInfo.version ? `/${appInfo.version}` : "";
  const url = appInfo.url ? ` (${appInfo.url})` : "";
  return `${appInfo.name}${version}${url}`;
}

export function clientTelemetry(appInfo?: AppInfo): string {
  const proc = runtimeProcess();
  const node = proc?.versions?.node;
  const runtime = node ? ` node/${node}` : "";
  const platform = proc?.platform && proc.arch ? ` (${proc.platform}; ${proc.arch})` : "";
  const app = appInfo ? ` ${formatAppInfo(appInfo)}` : "";
  // Semver build-metadata syntax: version+commit ("0.2.1+abc123456789";
  // "+dev" when running from source).
  return `entrybit-sdk-js/${VERSION}+${BUILD_SHA}${runtime}${platform}${app}`;
}

export function readEnvApiKey(): string | undefined {
  const value = runtimeProcess()?.env?.ENTRYBIT_API_KEY;
  return value && value.trim() ? value : undefined;
}

const LOG_LEVELS: readonly string[] = ["off", "error", "warn", "info", "debug"];

/**
 * `ENTRYBIT_LOG` environment variable (same idea as `OPENAI_LOG`): turns on
 * SDK logging for a deployed binary without a code change. Unrecognized
 * values are ignored; an explicit `logLevel` option always wins.
 */
export function readEnvLogLevel(): LogLevel | undefined {
  const value = runtimeProcess()?.env?.ENTRYBIT_LOG;
  return value !== undefined && LOG_LEVELS.includes(value) ? (value as LogLevel) : undefined;
}

export function isBrowserLike(): boolean {
  const w = (globalThis as { window?: { document?: unknown } }).window;
  return (
    typeof w === "object" && w !== null && typeof w.document === "object" && w.document !== null
  );
}

/** Runtime details for `debugInfo()` — the same facts the telemetry header carries. */
export function runtimeInfo(): {
  node: string | undefined;
  platform: string | undefined;
  arch: string | undefined;
  browserLike: boolean;
} {
  const proc = runtimeProcess();
  return {
    node: proc?.versions?.node,
    platform: proc?.platform,
    arch: proc?.arch,
    browserLike: isBrowserLike(),
  };
}
