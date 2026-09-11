import { useEffect, useState } from "react";
import {
  flattenOriginUnitOptions,
  type OriginUnitOption,
} from "@/lib/tickets/ticket-display";
import { listOrganizationalUnitTree } from "@/services/organizational-units-api";
import {
  listOfferedServices,
  type ServiceResponse,
} from "@/services/service-catalog-api";

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
    void Promise.all([listOfferedServices(), listOrganizationalUnitTree()])
      .then(([offered, tree]) => {
        if (cancelled) {
          return;
        }
        setServices(offered);
        setOriginUnits(flattenOriginUnitOptions(tree));
      })
      .catch(() => {
        if (!cancelled) {
          setErrorKey("tickets.errorCatalog");
        }
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
