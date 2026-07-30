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
