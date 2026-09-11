import { useCallback, useEffect, useState } from "react";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import {
  getServiceForm,
  listServices,
  type ServiceFormResponse,
  type ServiceResponse,
} from "@/services/service-catalog-api";

export type ServiceCatalogRow = {
  readonly service: ServiceResponse;
  readonly form: ServiceFormResponse | null;
};

export type ServiceCatalogState = {
  readonly rows: readonly ServiceCatalogRow[];
  readonly isLoading: boolean;
  readonly errorKey: ApiErrorKey | null;
  readonly requestId: string | null;
  readonly reload: () => Promise<void>;
};

export function useServiceCatalog(): ServiceCatalogState {
  const [rows, setRows] = useState<readonly ServiceCatalogRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<ApiErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setErrorKey(null);
    setRequestId(null);
    try {
      const services = await listServices();
      setRows(
        await Promise.all(
          // A service with no form version at all answers 404, which is the
          // state this screen exists to fix rather than an error to report.
          services.map(async (service) => ({
            service,
            form: await getServiceForm(service.id).catch(() => null),
          })),
        ),
      );
    } catch (error) {
      setRows([]);
      setErrorKey(mapApiError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { rows, isLoading, errorKey, requestId, reload };
}
