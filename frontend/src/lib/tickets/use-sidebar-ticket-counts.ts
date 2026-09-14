import { useEffect, useState } from "react";
import {
  countSidebarTicketBadges,
  type SidebarTicketCounts,
} from "@/lib/tickets/count-sidebar-ticket-badges";
import {
  listGroupInbox,
  listTickets,
  type TicketResponse,
} from "@/services/tickets-api";

export type { SidebarTicketCounts };

const sidebarTicketCountsCacheTimeToLiveMilliseconds = 30_000;

type CachedSidebarTicketCounts = {
  readonly cachedAtMilliseconds: number;
  readonly counts: SidebarTicketCounts;
};

let cachedSidebarTicketCounts: CachedSidebarTicketCounts | null = null;
let inFlightSidebarTicketCounts: Promise<SidebarTicketCounts> | null = null;

function isCacheFresh(entry: CachedSidebarTicketCounts): boolean {
  return (
    Date.now() - entry.cachedAtMilliseconds <
    sidebarTicketCountsCacheTimeToLiveMilliseconds
  );
}

async function loadSidebarTicketCounts(): Promise<SidebarTicketCounts> {
  if (
    cachedSidebarTicketCounts !== null &&
    isCacheFresh(cachedSidebarTicketCounts)
  ) {
    return cachedSidebarTicketCounts.counts;
  }
  if (inFlightSidebarTicketCounts !== null) {
    return inFlightSidebarTicketCounts;
  }
  inFlightSidebarTicketCounts = (async () => {
    const tickets = await listTickets();
    const inbox = await listGroupInbox().catch(
      (): readonly TicketResponse[] => [],
    );
    const counts = countSidebarTicketBadges(tickets, inbox);
    cachedSidebarTicketCounts = {
      cachedAtMilliseconds: Date.now(),
      counts,
    };
    return counts;
  })();
  try {
    return await inFlightSidebarTicketCounts;
  } finally {
    inFlightSidebarTicketCounts = null;
  }
}

export function useSidebarTicketCounts(): SidebarTicketCounts | null {
  const [counts, setCounts] = useState<SidebarTicketCounts | null>(
    () => cachedSidebarTicketCounts?.counts ?? null,
  );

  useEffect(() => {
    let isCancelled = false;
    void loadSidebarTicketCounts()
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

  return counts;
}
