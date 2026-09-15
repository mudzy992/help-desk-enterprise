import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RoutingCoverageTable } from "@/components/routing/routing-coverage-table";
import { Card, CardHeader } from "@/components/ui/card";
import { errorTextClassName } from "@/components/ui/control";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { mapRoutingError, type RoutingErrorKey } from "@/lib/routing/map-routing-error";
import {
  listRoutingCoverage,
  type RoutingCoverageItem,
} from "@/services/routing-api";

export function RoutingCoveragePanel() {
  const { t } = useTranslation();
  const [items, setItems] = useState<readonly RoutingCoverageItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<RoutingErrorKey | null>(null);

  const loadCoverage = useCallback(async () => {
    setIsLoading(true);
    setErrorKey(null);
    try {
      setItems(await listRoutingCoverage());
    } catch (error) {
      setItems([]);
      setErrorKey(mapRoutingError(error));
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
          <p className={errorTextClassName}>{t(errorKey)}</p>
        ) : (
          <RoutingCoverageTable items={items} />
        )}
      </div>
    </Card>
  );
}
