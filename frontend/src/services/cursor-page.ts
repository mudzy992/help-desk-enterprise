export type CursorPageMetadata = {
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
};

export type CursorPage<T> = CursorPageMetadata & {
  readonly items: readonly T[];
};
