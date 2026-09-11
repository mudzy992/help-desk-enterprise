import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CreateRoutingRuleForm } from "@/components/routing/create-routing-rule-form";
import { RoutingCoverageTable } from "@/components/routing/routing-coverage-table";
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
    <section className="max-w-6xl">
      <h2 className="text-section font-medium text-foreground">
        {t("routing.title")}
      </h2>
      <p className="mt-2 text-body text-muted-foreground">{t("routing.intro")}</p>
      <h3 className="mt-6 text-body font-medium text-foreground">
        {t("routing.createHeading")}
      </h3>
      <CreateRoutingRuleForm onCreated={loadCoverage} />
      <h3 className="mt-8 text-body font-medium text-foreground">
        {t("routing.coverageHeading")}
      </h3>
      {isLoading ? (
        <div className="mt-3 h-32 animate-pulse bg-elevated" />
      ) : errorKey ? (
        <p className="mt-3 text-body text-destructive">{t(errorKey)}</p>
      ) : (
        <RoutingCoverageTable items={items} />
      )}
    </section>
  );
}
