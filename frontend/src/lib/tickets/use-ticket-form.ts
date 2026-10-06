import { useEffect, useState } from "react";
import { getTicketForm, type TicketFormResponse } from "@/services/tickets-api";

export function useTicketForm(ticketId: string | undefined): TicketFormResponse | null {
  const [ticketForm, setTicketForm] = useState<TicketFormResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTicketForm(null);
    if (ticketId === undefined) {
      return () => {
        cancelled = true;
      };
    }
    void getTicketForm(ticketId)
      .then((response) => {
        if (!cancelled) setTicketForm(response);
      })
      .catch(() => {
        // GET /tickets/:id already succeeded; retain the defensive raw-value
        // fallback in the detail view if the schema endpoint is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  return ticketForm;
}
