import { EntryBitError } from "../errors/index.js";
import type { CursorPage } from "../types/pagination.js";

/**
 * Turns a page fetcher into an async iterator over individual items,
 * transparently following `next_cursor`.
 */
export async function* iterateCursorPages<T>(
  fetchPage: (cursor: string | undefined) => Promise<CursorPage<T>>,
  initialCursor?: string,
): AsyncGenerator<T, void, undefined> {
  let cursor = initialCursor;
  for (;;) {
    const page = await fetchPage(cursor);
    for (const item of page.items) yield item;
    if (!page.has_more || page.next_cursor == null) return;
    if (page.next_cursor === cursor) {
      // A server bug echoing the same cursor forever would otherwise spin
      // this loop (and the API) indefinitely.
      throw new EntryBitError(
        "Pagination cursor did not advance between pages; aborting iteration.",
      );
    }
    cursor = page.next_cursor;
  }
}
