import { useCallback, useEffect, useMemo, useState } from "react";
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
  listRoutingHandlerGroups,
  type RoutingCoverageItem,
  type RoutingHandlerGroup,
} from "@/services/routing-api";

interface RoutingCoveragePanelProperties {
  readonly onCreateRule: () => void;
}

export function RoutingCoveragePanel({ onCreateRule }: RoutingCoveragePanelProperties) {
  const { t } = useTranslation();
  const [items, setItems] = useState<readonly RoutingCoverageItem[]>([]);
  const [groups, setGroups] = useState<readonly RoutingHandlerGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<RoutingErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const groupNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of groups) {
      map.set(group.id, group.name);
    }
    return map;
  }, [groups]);

  const loadCoverage = useCallback(async () => {
    setIsLoading(true);
    setErrorKey(null);
    setRequestId(null);
    try {
      const [coverage, handlerGroups] = await Promise.all([
        listRoutingCoverage(),
        listRoutingHandlerGroups(),
      ]);
      setItems(coverage);
      setGroups(handlerGroups);
    } catch (error) {
      setItems([]);
      setGroups([]);
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
            groupNameById={groupNameById}
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
