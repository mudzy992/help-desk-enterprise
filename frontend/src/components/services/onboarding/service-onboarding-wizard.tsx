import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { OnboardingWizardSteps } from "@/components/services/onboarding/onboarding-wizard-steps";
import { ServiceOnboardingStepper } from "@/components/services/onboarding/service-onboarding-stepper";
import type { OnboardingServiceValues } from "@/components/services/onboarding/onboarding-service-step";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { errorTextClassName } from "@/components/ui/control";
import {
  completeNamedOnboardingStep,
  completeServiceOnboardingStep,
} from "@/lib/services/complete-onboarding-step";
import {
  mapServiceOnboardingError,
  type ServiceOnboardingErrorKey,
} from "@/lib/services/map-service-onboarding-error";
import { completedOnboardingCount } from "@/lib/services/onboarding-step-state";
import { loadOrStartOnboarding } from "@/lib/services/load-or-start-onboarding";
import { getService, type ServiceResponse } from "@/services/service-catalog-api";
import type { ServiceCategoryResponse } from "@/services/service-categories-api";
import {
  abandonServiceOnboarding,
  finalizeServiceOnboarding,
  type ServiceOnboardingResponse,
} from "@/services/service-onboarding-api";
import { listSlaProfiles, type SlaProfile } from "@/services/sla-api";

interface ServiceOnboardingWizardProperties {
  readonly serviceId: string | null;
  readonly categories: readonly ServiceCategoryResponse[];
  readonly canWriteForms: boolean;
  readonly onClose: () => void;
  readonly onFinished: () => Promise<void>;
}

export function ServiceOnboardingWizard({
  serviceId,
  categories,
  canWriteForms,
  onClose,
  onFinished,
}: ServiceOnboardingWizardProperties) {
  const { t } = useTranslation();
  const [record, setRecord] = useState<ServiceOnboardingResponse | null>(null);
  const [service, setService] = useState<ServiceResponse | null>(null);
  const [profiles, setProfiles] = useState<readonly SlaProfile[]>([]);
  const [activeFormRef, setActiveFormRef] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<ServiceOnboardingErrorKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listSlaProfiles()
      .then((loaded) => {
        if (!cancelled) setProfiles(loaded);
      })
      .catch(() => {
        if (!cancelled) setProfiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (serviceId === null) {
      setRecord(null);
      setService(null);
      return;
    }
    let cancelled = false;
    void loadOrStartOnboarding(serviceId)
      .then((loaded) => {
        if (!cancelled) {
          setRecord(loaded.record);
          setService(loaded.service);
          setActiveFormRef(loaded.record.formVersionRef);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setErrorKey(mapServiceOnboardingError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [serviceId]);

  const run = async (work: () => Promise<ServiceOnboardingResponse>) => {
    setIsSaving(true);
    setErrorKey(null);
    try {
      const next = await work();
      setRecord(next);
      setService(await getService(next.serviceId));
      if (next.status === "COMPLETED") {
        await onFinished();
        onClose();
      }
    } catch (error) {
      setErrorKey(mapServiceOnboardingError(error));
    } finally {
      setIsSaving(false);
    }
  };

  const completed = record ? completedOnboardingCount(record.completedSteps) : 0;

  return (
    <Card className="mt-4">
      <CardHeader
        title={t("services.onboarding.title")}
        subtitle={t("services.onboarding.subtitle")}
        actions={
          <div className="flex gap-2">
            {record && record.status !== "COMPLETED" ? (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={isSaving}
                onClick={() => void run(() => abandonServiceOnboarding(record.serviceId))}
              >
                {t("services.onboarding.abandon")}
              </Button>
            ) : null}
            <Button type="button" size="xs" variant="outline" onClick={onClose}>
              {t("services.onboarding.close")}
            </Button>
          </div>
        }
      />
      <div className="px-4 pb-4">
        <ServiceOnboardingStepper activeIndex={completed} />
        {errorKey ? <p className={`mb-3 ${errorTextClassName}`}>{t(errorKey)}</p> : null}
        <OnboardingWizardSteps
          record={record}
          service={service}
          categories={categories}
          profiles={profiles}
          activeFormRef={activeFormRef}
          canWriteForms={canWriteForms}
          isSaving={isSaving}
          canFinalize={record?.status === "READY_FOR_FINALIZATION" || completed === 5}
          onActiveVersion={setActiveFormRef}
          onService={(values: OnboardingServiceValues) =>
            void run(() => completeServiceOnboardingStep(record, values))
          }
          onForm={(formVersionRef) => {
            if (record) {
              void run(() =>
                completeNamedOnboardingStep(record.serviceId, "FORM", formVersionRef),
              );
            }
          }}
          onRouting={(reference) => {
            if (record) {
              void run(() =>
                completeNamedOnboardingStep(record.serviceId, "ROUTING", reference),
              );
            }
          }}
          onSla={(slaProfileId) => {
            if (record) {
              void run(() =>
                completeNamedOnboardingStep(record.serviceId, "SLA", slaProfileId),
              );
            }
          }}
          onApprovals={(reference) => {
            if (record) {
              void run(() =>
                completeNamedOnboardingStep(record.serviceId, "APPROVALS", reference),
              );
            }
          }}
          onFinalize={() => {
            if (record) {
              void run(() => finalizeServiceOnboarding(record.serviceId));
            }
          }}
          onReloadRouting={() => {
            if (record) {
              void run(async () => (await loadOrStartOnboarding(record.serviceId)).record);
            }
          }}
        />
      </div>
    </Card>
  );
}

