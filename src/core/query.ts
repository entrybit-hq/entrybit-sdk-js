import type { QueryValue } from "../types/requests.js";

/**
 * Serializes a query map to a `?`-prefixed string. `undefined`/`null` values
 * and empty arrays are omitted; arrays are joined with commas (the API's
 * convention for multi-value parameters such as `fields`).
 */
export function buildQuery(query: Record<string, QueryValue> | undefined): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      params.set(key, value.join(","));
    } else {
      params.set(key, String(value));
    }
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}
