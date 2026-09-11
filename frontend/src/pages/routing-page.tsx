import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CreateRoutingRuleForm } from "@/components/routing/create-routing-rule-form";
import { RoutingCoverageTable } from "@/components/routing/routing-coverage-table";
import { Card, CardHeader } from "@/components/ui/card";
import { errorTextClassName } from "@/components/ui/control";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/services/api";
import {
  listRoutingCoverage,
  type RoutingCoverageItem,
} from "@/services/routing-api";

export function RoutingPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<readonly RoutingCoverageItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<
    "routing.errorUnauthorized" | "routing.errorGeneric" | null
  >(null);

  const loadCoverage = useCallback(async () => {
    setIsLoading(true);
    setErrorKey(null);
    try {
      setItems(await listRoutingCoverage());
    } catch (error) {
      setItems([]);
      setErrorKey(
        error instanceof ApiError && error.status === 401
          ? "routing.errorUnauthorized"
          : "routing.errorGeneric",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCoverage();
  }, [loadCoverage]);

  return (
    <section>
      <PageHeader
        crumbs={["EP-HelpDesk", t("routing.title")]}
        title={t("routing.title")}
        subtitle={t("routing.intro")}
      />
      <Card className="mb-4">
        <CardHeader title={t("routing.createHeading")} />
        <div className="px-4 py-3.5">
          <CreateRoutingRuleForm onCreated={loadCoverage} />
        </div>
      </Card>
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
    </section>
  );
}
