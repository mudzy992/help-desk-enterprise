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
  readonly includesInbox: boolean;
};

let cachedSidebarTicketCounts: CachedSidebarTicketCounts | null = null;
let inFlightSidebarTicketCounts: Promise<SidebarTicketCounts> | null = null;
let inFlightIncludesInbox = false;

function isCacheFresh(entry: CachedSidebarTicketCounts): boolean {
  return (
    Date.now() - entry.cachedAtMilliseconds <
    sidebarTicketCountsCacheTimeToLiveMilliseconds
  );
}

async function loadSidebarTicketCounts(includeInbox: boolean): Promise<SidebarTicketCounts> {
  if (
    cachedSidebarTicketCounts !== null &&
    isCacheFresh(cachedSidebarTicketCounts) &&
    (cachedSidebarTicketCounts.includesInbox || !includeInbox)
  ) {
    return cachedSidebarTicketCounts.counts;
  }
  if (
    inFlightSidebarTicketCounts !== null &&
    (inFlightIncludesInbox || !includeInbox)
  ) {
    return inFlightSidebarTicketCounts;
  }
  inFlightIncludesInbox = includeInbox;
  inFlightSidebarTicketCounts = (async () => {
    const tickets = await listTickets();
    const inbox = includeInbox
      ? await listGroupInbox().catch((): readonly TicketResponse[] => [])
      : [];
    const counts = countSidebarTicketBadges(tickets, inbox);
    cachedSidebarTicketCounts = {
      cachedAtMilliseconds: Date.now(),
      counts,
      includesInbox: includeInbox,
    };
    return counts;
  })();
  try {
    return await inFlightSidebarTicketCounts;
  } finally {
    inFlightSidebarTicketCounts = null;
  }
}

export function useSidebarTicketCounts(includeInbox: boolean): SidebarTicketCounts | null {
  const [counts, setCounts] = useState<SidebarTicketCounts | null>(
    () => cachedSidebarTicketCounts?.counts ?? null,
  );

  useEffect(() => {
    let isCancelled = false;
    void loadSidebarTicketCounts(includeInbox)
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
  }, [includeInbox]);

  return counts;
}
