import { useCallback, useState } from "react";

export function useTicketListSelection() {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  const toggleSelected = useCallback((ticketId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(ticketId)) next.delete(ticketId);
      else next.add(ticketId);
      return next;
    });
  }, []);

  return { selectedIds, setSelectedIds, clearSelection, toggleSelected };
}
