import { EntryBitError } from "../errors/index.js";

/**
 * Validates and percent-encodes a path parameter. Rejects values the WHATWG
 * URL parser would rewrite into a different endpoint: `encodeURIComponent`
 * leaves `.` alone, so `""`, `"."` and `".."` would collapse into the
 * collection URL (or a parent path) instead of addressing a resource.
 */
export function encodePathParam(name: string, value: string): string {
  if (typeof value !== "string" || !value.trim() || value === "." || value === "..") {
    throw new EntryBitError(
      `Invalid ${name}: expected a non-empty resource id, got ${JSON.stringify(value)}.`,
    );
  }
  return encodeURIComponent(value);
}
