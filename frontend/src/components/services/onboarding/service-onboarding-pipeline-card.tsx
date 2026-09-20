import { useTranslation } from "react-i18next";
import { ServiceOnboardingStepper } from "@/components/services/onboarding/service-onboarding-stepper";
import { Badge, MetaBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { completedOnboardingCount } from "@/lib/services/onboarding-step-state";
import type { ServiceCatalogRow } from "@/lib/services/use-service-catalog";
import {
  SERVICE_ONBOARDING_STEPS,
  type ServiceOnboardingResponse,
} from "@/services/service-onboarding-api";

interface ServiceOnboardingPipelineCardProperties {
  readonly onboardings: readonly ServiceOnboardingResponse[];
  readonly rows: readonly ServiceCatalogRow[];
  readonly categoryNames: ReadonlyMap<string, string>;
  readonly onContinue: (serviceId: string) => void;
}

export function ServiceOnboardingPipelineCard({
  onboardings,
  rows,
  categoryNames,
  onContinue,
}: ServiceOnboardingPipelineCardProperties) {
  const { t } = useTranslation();
  const active = onboardings[0];
  if (active === undefined) {
    return null;
  }
  const service = rows.find((row) => row.service.id === active.serviceId)?.service;
  const completed = completedOnboardingCount(active.completedSteps);
  const activeIndex = completed;

  return (
    <Card className="mt-4">
      <CardHeader
        title={t("services.onboarding.title")}
        subtitle={t("services.onboarding.subtitle")}
        actions={
          <Badge tone="info" dot>
            {t("services.onboarding.activeBadge", { count: onboardings.length })}
          </Badge>
        }
      />
      <div className="grid grid-cols-1 gap-3 px-4 pb-4 md:grid-cols-[220px_1fr]">
        <div className="rounded-md border border-border bg-background/40 p-3">
          <p className="text-[12.5px] font-semibold text-foreground">
            {service?.name ?? "—"}
          </p>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            {categoryNames.get(service?.categoryId ?? "") ?? service?.slug}
          </p>
          <MetaBadge
            meta={{
              label: t("services.onboarding.progress", {
                completed,
                total: SERVICE_ONBOARDING_STEPS.length,
              }),
              tone: "info",
            }}
            className="mt-2"
          />
          <Button
            type="button"
            size="xs"
            className="mt-3"
            onClick={() => onContinue(active.serviceId)}
          >
            {active.status === "ABANDONED"
              ? t("services.onboarding.resume")
              : t("services.onboarding.next")}
          </Button>
        </div>
        <div className="flex items-center overflow-x-auto">
          <ServiceOnboardingStepper activeIndex={activeIndex} />
        </div>
      </div>
    </Card>
  );
}
