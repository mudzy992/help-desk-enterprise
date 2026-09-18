import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RoutingChangeLogPanel } from "@/components/routing/routing-change-log-panel";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { readApiRequestId } from "@/lib/map-api-error";
import { mapRoutingError, type RoutingErrorKey } from "@/lib/routing/map-routing-error";
import {
  listRoutingChanges,
  type RoutingChangeLogEntry,
} from "@/services/routing-api";

export function RoutingChangeLogTab() {
  const { t } = useTranslation();
  const [changes, setChanges] = useState<readonly RoutingChangeLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<RoutingErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const loadChanges = useCallback(async () => {
    setIsLoading(true);
    setErrorKey(null);
    setRequestId(null);
    try {
      setChanges(await listRoutingChanges());
    } catch (error) {
      setChanges([]);
      setErrorKey(mapRoutingError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadChanges();
  }, [loadChanges]);

  if (isLoading) {
    return <PanelSkeleton label={t("routing.changeLogHeading")} />;
  }
  if (errorKey) {
    return <ApiErrorText messageKey={errorKey} requestId={requestId} />;
  }
  return <RoutingChangeLogPanel entries={changes} />;
}
