import { useEffect, useState } from "react";
import { listOfferedServices } from "@/services/service-catalog-api";
import type { TicketResponse } from "@/services/tickets-api";

export function useTicketServiceName(ticket: TicketResponse | null): string {
  const [serviceName, setServiceName] = useState("");
  useEffect(() => {
    if (ticket === null) {
      return;
    }
    void listOfferedServices()
      .then((services) => {
        const match = services.find((item) => item.id === ticket.serviceId);
        setServiceName(match?.name ?? ticket.serviceId);
      })
      .catch(() => setServiceName(ticket.serviceId));
  }, [ticket]);
  return serviceName;
}
