import { GitMerge } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TicketResponse } from "@/services/tickets-api";

/** Package 1.2 (M7): merge icon next to a merged child's number in lists. */
export function TicketMergeIndicator({ ticket }: { readonly ticket: Pick<TicketResponse, "mergedIntoTicketId" | "mergedIntoTicketNumber"> }) {
  const { t } = useTranslation();
  if ((ticket.mergedIntoTicketId ?? null) === null) {
    return null;
  }
  const label = t("tickets.merge.indicator", { number: ticket.mergedIntoTicketNumber ?? "—" });
  return (
    <span className="inline-flex shrink-0 items-center text-muted-foreground" title={label} data-testid="ticket-merge-indicator">
      <GitMerge size={12} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
