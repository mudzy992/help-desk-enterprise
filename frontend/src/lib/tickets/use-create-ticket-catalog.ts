import { useEffect, useState } from "react";
import { loadCreateTicketCatalog } from "@/lib/tickets/load-create-ticket-catalog";
import type { OriginUnitOption } from "@/lib/tickets/ticket-display";
import type { ServiceResponse } from "@/services/service-catalog-api";

export function useCreateTicketCatalog(): {
  readonly services: readonly ServiceResponse[];
  readonly originUnits: readonly OriginUnitOption[];
  readonly isLoading: boolean;
  readonly errorKey: "tickets.errorCatalog" | null;
} {
  const [services, setServices] = useState<readonly ServiceResponse[]>([]);
  const [originUnits, setOriginUnits] = useState<readonly OriginUnitOption[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<"tickets.errorCatalog" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadCreateTicketCatalog()
      .then((result) => {
        if (cancelled) {
          return;
        }
        setServices(result.services);
        setOriginUnits(result.originUnits);
        setErrorKey(result.errorKey);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { services, originUnits, isLoading, errorKey };
}
