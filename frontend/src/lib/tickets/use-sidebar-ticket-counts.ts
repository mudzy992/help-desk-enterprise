import { useEffect, useState } from "react";
import {
  toSidebarTicketCounts,
  type SidebarTicketCounts,
} from "@/lib/tickets/count-sidebar-ticket-badges";
import {
  getTicketCounts,
  type TicketCounts,
} from "@/services/tickets-counts-api";

export type { SidebarTicketCounts };

const sidebarTicketCountsCacheTimeToLiveMilliseconds = 30_000;

type CachedTicketCounts = {
  readonly cachedAtMilliseconds: number;
  readonly counts: TicketCounts;
};

let cachedTicketCounts: CachedTicketCounts | null = null;
let inFlightTicketCounts: Promise<TicketCounts> | null = null;

function isCacheFresh(entry: CachedTicketCounts): boolean {
  return (
    Date.now() - entry.cachedAtMilliseconds <
    sidebarTicketCountsCacheTimeToLiveMilliseconds
  );
}

async function loadTicketCounts(): Promise<TicketCounts> {
  if (cachedTicketCounts !== null && isCacheFresh(cachedTicketCounts)) {
    return cachedTicketCounts.counts;
  }
  if (inFlightTicketCounts !== null) {
    return inFlightTicketCounts;
  }
  inFlightTicketCounts = getTicketCounts().then((counts) => {
    cachedTicketCounts = { cachedAtMilliseconds: Date.now(), counts };
    return counts;
  });
  try {
    return await inFlightTicketCounts;
  } finally {
    inFlightTicketCounts = null;
  }
}

export function useSidebarTicketCounts(
  includeInbox: boolean,
): SidebarTicketCounts | null {
  const [counts, setCounts] = useState<TicketCounts | null>(
    () => cachedTicketCounts?.counts ?? null,
  );

  useEffect(() => {
    let isCancelled = false;
    void loadTicketCounts()
      .then((nextCounts) => {
        if (!isCancelled) {
          setCounts(nextCounts);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setCounts(null);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, []);

  return counts === null ? null : toSidebarTicketCounts(counts, includeInbox);
}
