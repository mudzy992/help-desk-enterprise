import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CreateRoutingRuleForm } from "@/components/routing/create-routing-rule-form";
import { RoutingRulesTable } from "@/components/routing/routing-rules-table";
import { Card, CardHeader } from "@/components/ui/card";
import { errorTextClassName } from "@/components/ui/control";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { mapRoutingError, type RoutingErrorKey } from "@/lib/routing/map-routing-error";
import { useRoutingCatalog } from "@/lib/routing/use-routing-catalog";
import {
  listRoutingRules,
  type RoutingRuleResponse,
} from "@/services/routing-api";

export function RoutingRulesPanel() {
  const { t } = useTranslation();
  const catalog = useRoutingCatalog();
  const [rules, setRules] = useState<readonly RoutingRuleResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<RoutingErrorKey | null>(null);

  const loadRules = useCallback(async () => {
    setIsLoading(true);
    setErrorKey(null);
    try {
      setRules(await listRoutingRules());
    } catch (error) {
      setRules([]);
      setErrorKey(mapRoutingError(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_330px]">
      <Card>
        <CardHeader
          title={t("routing.rulesHeading")}
          subtitle={t("routing.rulesSubtitle")}
        />
        {isLoading ? (
          <div className="px-4 py-3.5">
            <PanelSkeleton className="mt-0" label={t("routing.rulesHeading")} />
          </div>
        ) : errorKey ? (
          <p className={`px-4 py-3.5 ${errorTextClassName}`}>{t(errorKey)}</p>
        ) : (
          <RoutingRulesTable rules={rules} />
        )}
      </Card>
      <Card>
        <CardHeader
          title={t("routing.createHeading")}
          subtitle={t("routing.createSubtitle")}
        />
        <div className="px-4 py-4">
          {catalog.isLoading ? (
            <PanelSkeleton className="mt-0" label={t("routing.createHeading")} />
          ) : catalog.errorKey ? (
            <p className={errorTextClassName}>{t(catalog.errorKey)}</p>
          ) : (
            <CreateRoutingRuleForm
              originUnits={catalog.originUnits}
              services={catalog.services}
              existingRules={rules}
              onCreated={loadRules}
            />
          )}
        </div>
      </Card>
    </div>
  );
}
