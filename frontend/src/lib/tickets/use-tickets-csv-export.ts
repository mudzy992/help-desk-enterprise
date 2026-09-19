import { useCallback, useState } from "react";
import { triggerBlobDownload } from "@/lib/download/trigger-blob-download";
import type { TicketListFilters } from "@/lib/tickets/filter-tickets";
import { buildTicketExportQuery } from "@/lib/tickets/build-ticket-export-query";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { exportTicketsCsv } from "@/services/tickets-export-api";

export function useTicketsCsvExport(
  filters: TicketListFilters,
  onError: (key: TicketErrorKey | null) => void,
): { readonly isExporting: boolean; readonly run: () => Promise<void> } {
  const [isExporting, setIsExporting] = useState(false);
  const run = useCallback(async () => {
    setIsExporting(true);
    onError(null);
    try {
      const file = await exportTicketsCsv(buildTicketExportQuery(filters));
      triggerBlobDownload(file.blob, file.fileName);
    } catch (error) {
      onError(mapTicketError(error));
    } finally {
      setIsExporting(false);
    }
  }, [filters, onError]);
  return { isExporting, run };
}
