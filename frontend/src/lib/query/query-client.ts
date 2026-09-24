import { QueryClient } from "@tanstack/react-query";

/**
 * Faza 3.3 (plan §3.3): the client-side cache defaults.
 *
 * - `staleTime: 30 s` — the realtime socket is what makes data fresh, so a screen
 *   that comes back within half a minute does not fetch again.
 * - catalogs use `catalogQueryStaleTimeMs` (5 min) — OU tree, service catalog and
 *   handler groups change rarely and were the collections fetched 2–4× per session.
 * - `retry: 1` — one retry, not three: the socket reconnect logic already handles
 *   the "server is restarting" case.
 * - `refetchOnWindowFocus: false` — focus refetching would fight the socket.
 */
export const defaultQueryStaleTimeMs = 30_000;
export const catalogQueryStaleTimeMs = 300_000;
export const queryGcTimeMs = 5 * 60_000;
export const queryRetryCount = 1;

export function createHelpdeskQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: defaultQueryStaleTimeMs,
        gcTime: queryGcTimeMs,
        retry: queryRetryCount,
        refetchOnWindowFocus: false,
      },
    },
  });
}

/** The single client of the app (created once per browser session). */
export const helpdeskQueryClient = createHelpdeskQueryClient();
