import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CreateTicketFields } from "@/components/tickets/create-ticket-fields";
import { CreateTicketInterceptView } from "@/components/tickets/create-ticket-intercept-view";
import { CreateTicketServicePicker } from "@/components/tickets/create-ticket-service-picker";
import { CreateTicketSidePanel } from "@/components/tickets/create-ticket-side-panel";
import { CreateTicketStepNav } from "@/components/tickets/create-ticket-step-nav";
import { CreateTicketStepper } from "@/components/tickets/create-ticket-stepper";
import { TicketErrorState } from "@/components/tickets/ticket-feedback-states";
import { Card } from "@/components/ui/card";
import { PanelSkeleton } from "@/components/ui/skeleton";
import {
  buildCreateTicketInput,
  isCreateTicketDraftReady,
  isServiceReadyForTicketCreation,
  knowledgeInterceptQuery,
  type CreateTicketDraft,
} from "@/lib/tickets/build-create-ticket-input";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { defaultOriginUnitId } from "@/lib/tickets/ticket-display";
import { ticketText } from "@/lib/tickets/ticket-text";
import { useCreateTicketCatalog } from "@/lib/tickets/use-create-ticket-catalog";
import { validateServiceFormData } from "@/lib/tickets/validate-service-form";
import { activeFormVersion, getServiceForm, type FormVersionResponse } from "@/services/service-catalog-api";
import { interceptKnowledgeArticles, type KnowledgeInterceptSuggestion } from "@/services/knowledge-base-api";
import { createTicket } from "@/services/tickets-api";

const emptyDraft: CreateTicketDraft = {
  title: "",
  description: "",
  impact: "MEDIUM",
  urgency: "MEDIUM",
  serviceId: "",
  originUnitId: "",
  formVersionRef: null,
  formData: {},
};

export function CreateTicketForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const catalog = useCreateTicketCatalog();
  const [draft, setDraft] = useState<CreateTicketDraft>(emptyDraft);
  const [activeForm, setActiveForm] = useState<FormVersionResponse | null>(null);
  const [step, setStep] = useState(0);
  const [suggestions, setSuggestions] = useState<readonly KnowledgeInterceptSuggestion[]>([]);
  const [helped, setHelped] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ReadonlyMap<string, string>>(new Map());
  const [errorKey, setErrorKey] = useState<TicketErrorKey | "tickets.errorCatalog" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const displayedError = errorKey ?? catalog.errorKey;
  const isServiceReady = isServiceReadyForTicketCreation(draft, activeForm !== null);

  useEffect(() => {
    const fallback = defaultOriginUnitId(catalog.originUnits);
    if (fallback.length === 0) return;
    setDraft((current) => (current.originUnitId.length > 0 ? current : { ...current, originUnitId: fallback }));
  }, [catalog.originUnits]);

  useEffect(() => {
    if (draft.serviceId.length === 0) {
      setActiveForm(null);
      return;
    }
    let cancelled = false;
    void getServiceForm(draft.serviceId)
      .then((form) => {
        if (cancelled) return;
        const active = activeFormVersion(form);
        setActiveForm(active);
        setDraft((current) => ({
          ...current,
          formVersionRef: active?.formVersionRef ?? null,
          formData: current.serviceId === draft.serviceId ? current.formData : {},
        }));
      })
      .catch(() => {
        if (!cancelled) {
          setActiveForm(null);
          setErrorKey("tickets.errorCatalog");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [draft.serviceId]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step === 0) {
      setStep(1);
      return;
    }
    const schemaErrors = validateServiceFormData(activeForm?.schema ?? null, draft.formData);
    if (schemaErrors.length > 0) {
      setFieldErrors(new Map(schemaErrors.map((item) => [item.fieldId, ticketText(t, item.messageKey)])));
      return;
    }
    setFieldErrors(new Map());
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      const result = await interceptKnowledgeArticles({
        serviceId: draft.serviceId,
        query: knowledgeInterceptQuery(draft),
      });
      setSuggestions(result.articles);
      setStep(2);
    } catch (error) {
      setErrorKey(mapTicketError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitTicket = async (acknowledgeDuplicate = false) => {
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      const created = await createTicket(buildCreateTicketInput(draft, { acknowledgeDuplicate }));
      void navigate(`/tickets/${created.id}`);
    } catch (error) {
      setErrorKey(mapTicketError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (catalog.isLoading) {
    return <PanelSkeleton label={t("tickets.loading")} />;
  }
  if (step === 2) {
    return (
      <CreateTicketInterceptView
        displayedError={displayedError}
        isSubmitting={isSubmitting}
        items={suggestions}
        helped={helped}
        onHelped={() => setHelped(true)}
        onContinue={() => void submitTicket()}
        onBack={() => setStep(1)}
        onCreateAnyway={() => void submitTicket(true)}
      />
    );
  }

  return (
    <form className="mt-1" onSubmit={(event) => void onSubmit(event)}>
      <CreateTicketStepper activeIndex={step} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_300px]">
        <Card>
          {step === 0 ? (
            <CreateTicketServicePicker
              services={catalog.services}
              selectedId={draft.serviceId}
              onSelect={(serviceId) =>
                setDraft((current) => ({
                  ...current,
                  serviceId,
                  formData: serviceId === current.serviceId ? current.formData : {},
                  formVersionRef: serviceId === current.serviceId ? current.formVersionRef : null,
                }))
              }
            />
          ) : (
            <CreateTicketFields
              draft={draft}
              originUnits={catalog.originUnits}
              selectedService={catalog.services.find((service) => service.id === draft.serviceId) ?? null}
              activeForm={activeForm}
              fieldErrors={fieldErrors}
              onChange={setDraft}
            />
          )}
          {displayedError ? (
            <div className="px-5">
              <TicketErrorState errorKey={displayedError} />
            </div>
          ) : null}
          <CreateTicketStepNav
            step={step}
            canNextService={draft.serviceId.length > 0 && isServiceReady}
            canSubmitDetails={isCreateTicketDraftReady(draft) && isServiceReady}
            isSubmitting={isSubmitting}
            onBack={() => setStep(0)}
          />
        </Card>
        <CreateTicketSidePanel />
      </div>
    </form>
  );
}
