import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RoutingCoverageTable } from "@/components/routing/routing-coverage-table";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { readApiRequestId } from "@/lib/map-api-error";
import { mapRoutingError, type RoutingErrorKey } from "@/lib/routing/map-routing-error";
import {
  listRoutingCoverage,
  type RoutingCoverageItem,
} from "@/services/routing-api";

interface RoutingCoveragePanelProperties {
  readonly onCreateRule: () => void;
}

export function RoutingCoveragePanel({ onCreateRule }: RoutingCoveragePanelProperties) {
  const { t } = useTranslation();
  const [items, setItems] = useState<readonly RoutingCoverageItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<RoutingErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const loadCoverage = useCallback(async () => {
    setIsLoading(true);
    setErrorKey(null);
    setRequestId(null);
    try {
      setItems(await listRoutingCoverage());
    } catch (error) {
      setItems([]);
      setErrorKey(mapRoutingError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCoverage();
  }, [loadCoverage]);

  return (
    <Card>
      <CardHeader title={t("routing.coverageHeading")} />
      <div className="px-4 py-3.5">
        {isLoading ? (
          <PanelSkeleton className="mt-0" label={t("routing.coverageHeading")} />
        ) : errorKey ? (
          <ApiErrorText messageKey={errorKey} requestId={requestId} />
        ) : (
          <RoutingCoverageTable
            items={items}
            emptyAction={
              <Button type="button" size="sm" onClick={onCreateRule}>
                {t("routing.newRule")}
              </Button>
            }
          />
        )}
      </div>
    </Card>
  );
}
