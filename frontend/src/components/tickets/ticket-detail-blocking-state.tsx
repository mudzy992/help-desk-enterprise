import { TicketBreakGlassPanel } from "@/components/tickets/ticket-break-glass-panel";
import { TicketErrorState, TicketLoadingState } from "@/components/tickets/ticket-feedback-states";
import type { TicketErrorKey } from "@/lib/tickets/map-ticket-error";

interface TicketDetailBlockingStateProperties {
  readonly isLoading: boolean;
  readonly errorKey: TicketErrorKey | null;
  readonly ticketId: string | undefined;
  readonly onReload: () => void;
}

export function TicketDetailBlockingState({
  isLoading,
  errorKey,
  ticketId,
  onReload,
}: TicketDetailBlockingStateProperties) {
  if (isLoading) {
    return <TicketLoadingState />;
  }
  if (errorKey === "tickets.errorConfidentialBreakGlass" && ticketId) {
    return (
      <section className="fade-in max-w-[1400px]">
        <TicketBreakGlassPanel ticketId={ticketId} onGranted={onReload} />
      </section>
    );
  }
  return (
    <section className="fade-in max-w-[1400px]">
      <TicketErrorState
        errorKey={errorKey ?? "tickets.errorNotFound"}
        onRetry={onReload}
      />
    </section>
  );
}
