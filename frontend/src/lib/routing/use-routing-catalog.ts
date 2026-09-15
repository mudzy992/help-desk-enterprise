import { useEffect, useState } from "react";
import { mapRoutingError, type RoutingErrorKey } from "@/lib/routing/map-routing-error";
import {
  flattenOriginUnitOptions,
  type OriginUnitOption,
} from "@/lib/tickets/ticket-display";
import { listOrganizationalUnitTree } from "@/services/organizational-units-api";
import { listServices, type ServiceResponse } from "@/services/service-catalog-api";

export function useRoutingCatalog() {
  const [originUnits, setOriginUnits] = useState<readonly OriginUnitOption[]>(
    [],
  );
  const [services, setServices] = useState<readonly ServiceResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<RoutingErrorKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setErrorKey(null);
      try {
        const [tree, catalog] = await Promise.all([
          listOrganizationalUnitTree(),
          listServices(),
        ]);
        if (cancelled) {
          return;
        }
        setOriginUnits(flattenOriginUnitOptions(tree));
        setServices(catalog);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setOriginUnits([]);
        setServices([]);
        setErrorKey(mapRoutingError(error));
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { originUnits, services, isLoading, errorKey };
}
