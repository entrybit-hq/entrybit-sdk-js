/**
 * Keyset (cursor) pagination, as returned by every EntryBit list endpoint:
 * pass `next_cursor` back as `cursor` until `has_more` is `false`.
 */
export interface CursorPage<T> {
  success: boolean;
  items: T[];
  /** Approximate total; unreliable while `search` is set. */
  total?: number | null;
  /** Pass back as `cursor` to fetch the next page. */
  next_cursor?: string | null;
  has_more: boolean;
}

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
    cursor = page.next_cursor;
  }
}
