import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OnboardingWizardSteps } from "@/components/services/onboarding/onboarding-wizard-steps";
import { ServiceOnboardingStepper } from "@/components/services/onboarding/service-onboarding-stepper";
import type { OnboardingServiceValues } from "@/components/services/onboarding/onboarding-service-step";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { Modal, ModalContent, ModalDescription, ModalTitle } from "@/components/ui/modal";
import { ScrollRegion } from "@/components/ui/scroll-region";
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
  const [isLoadingOnboarding, setIsLoadingOnboarding] = useState(false);
  const [errorKey, setErrorKey] = useState<ServiceOnboardingErrorKey | null>(null);
  const [coverageWarning, setCoverageWarning] = useState(false);
  const onboardingRequestSequence = useRef(0);

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

  const loadExistingOnboarding = useCallback(async (id: string) => {
    const sequence = ++onboardingRequestSequence.current;
    setIsLoadingOnboarding(true);
    setErrorKey(null);
    try {
      const loaded = await loadOrStartOnboarding(id);
      if (sequence === onboardingRequestSequence.current) {
        setRecord(loaded.record);
        setService(loaded.service);
        setActiveFormRef(loaded.record.formVersionRef);
      }
    } catch (error) {
      if (sequence === onboardingRequestSequence.current) {
        setErrorKey(mapServiceOnboardingError(error));
      }
    } finally {
      if (sequence === onboardingRequestSequence.current) {
        setIsLoadingOnboarding(false);
      }
    }
  }, []);

  useEffect(() => {
    if (serviceId === null) {
      onboardingRequestSequence.current += 1;
      setRecord(null);
      setService(null);
      setActiveFormRef(null);
      setCoverageWarning(false);
      setErrorKey(null);
      setIsLoadingOnboarding(false);
      return () => {
        onboardingRequestSequence.current += 1;
      };
    }
    setRecord(null);
    setService(null);
    setActiveFormRef(null);
    setCoverageWarning(false);
    void loadExistingOnboarding(serviceId);
    return () => {
      onboardingRequestSequence.current += 1;
    };
  }, [loadExistingOnboarding, serviceId]);

  const run = async (work: () => Promise<ServiceOnboardingResponse>) => {
    if (isSaving) return;
    setIsSaving(true);
    setErrorKey(null);
    try {
      const next = await work();
      const updatedService = await getService(next.serviceId);
      setRecord(next);
      setService(updatedService);
      const hasCoverageWarning =
        next.warnings?.includes("ROUTING_COVERAGE_MISSING") === true;
      setCoverageWarning(hasCoverageWarning);
      await onFinished();
      if (next.status === "ABANDONED" || (next.status === "COMPLETED" && !hasCoverageWarning)) {
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
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !isSaving) onClose();
      }}
    >
      <ModalContent
        className="max-w-5xl overflow-hidden p-0 sm:p-0"
        data-testid="service-onboarding-dialog"
      >
        <div className="flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col">
          <header className="shrink-0 border-b border-border/70 px-4 py-4 sm:px-6 sm:py-5">
            <div className="flex flex-wrap items-start justify-between gap-3 pr-7">
              <div className="min-w-0">
                <ModalTitle className="text-[15px] font-semibold leading-5 text-foreground">
                  {t("services.onboarding.title")}
                </ModalTitle>
                <ModalDescription className="mt-1 text-[12.5px] leading-5 text-muted-foreground">
                  {t("services.onboarding.subtitle")}
                </ModalDescription>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
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
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={isSaving}
                  onClick={onClose}
                >
                  {t("services.onboarding.close")}
                </Button>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="mx-auto grid max-w-4xl gap-4 sm:gap-5">
              <section className="rounded-xl border border-border/70 bg-elevated/25 p-3 sm:p-4">
                <ScrollRegion
                  label={t("services.onboarding.stepsHeading")}
                  className="overflow-x-auto pb-1"
                >
                  <ServiceOnboardingStepper
                    activeIndex={completed}
                    className="mb-0 min-w-[680px]"
                  />
                </ScrollRegion>
              </section>

              {isLoadingOnboarding ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-2 rounded-lg border border-border/70 bg-surface px-4 py-3 text-[12.5px] text-muted-foreground"
                >
                  <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
                  {t("services.onboarding.loadingRecord")}
                </div>
              ) : null}

              {errorKey ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/25 bg-danger/5 px-4 py-3">
                  <p role="alert" className={errorTextClassName}>{t(errorKey)}</p>
                  {serviceId !== null ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isLoadingOnboarding || isSaving}
                      onClick={() => void loadExistingOnboarding(serviceId)}
                    >
                      {t("services.retryLoad")}
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {coverageWarning ? (
                <p className="rounded-lg border border-warning/30 bg-warning/6 px-4 py-3 text-[12px] leading-5 text-foreground/90">
                  {t("services.onboarding.routingCoverageWarning")}
                </p>
              ) : null}

              {!isLoadingOnboarding && errorKey === null ? (
                <section className="rounded-xl border border-border/70 bg-surface p-4 sm:p-6">
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
                </section>
              ) : null}
            </div>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}
