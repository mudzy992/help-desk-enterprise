/**
 * After a redeploy the hashed chunk names change and the old ones are gone.
 * A tab still running the previous build then fails its next lazy import
 * ("Failed to fetch dynamically imported module"). The fix is one full
 * reload, which fetches the new index.html; the guard prevents a reload loop
 * when the chunk is missing for another reason (server down, offline).
 */

const storageKey = "hd.chunkReloadAt";
/** A second failure within this window is a real outage, not a stale build. */
export const chunkReloadWindowMs = 30_000;

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk [\w-]+ failed|Unable to preload CSS/i.test(
    message,
  );
}

export type ReloadStore = Pick<Storage, "getItem" | "setItem">;

/** True once per window: records the attempt and tells the caller to reload. */
export function shouldReloadForChunkError(store: ReloadStore | null, nowMs: number): boolean {
  if (store === null) return false;
  try {
    const last = Number(store.getItem(storageKey) ?? "0");
    if (Number.isFinite(last) && nowMs - last < chunkReloadWindowMs) return false;
    store.setItem(storageKey, String(nowMs));
    return true;
  } catch {
    return false;
  }
}

function sessionStore(): ReloadStore | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Reloads the page for a stale chunk; returns false when the caller must show an error instead. */
export function reloadForChunkError(error: unknown): boolean {
  if (!isChunkLoadError(error) || !shouldReloadForChunkError(sessionStore(), Date.now())) return false;
  window.location.reload();
  return true;
}
