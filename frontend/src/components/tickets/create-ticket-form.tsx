import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CreateTicketDraftView } from "@/components/tickets/create-ticket-draft-view";
import { CreateTicketFollowUpViews } from "@/components/tickets/create-ticket-follow-up-views";
import { PanelSkeleton } from "@/components/ui/skeleton";
import {
  buildCreateTicketInput,
  emptyCreateTicketDraft,
  isCreateTicketDraftReady,
  isServiceReadyForTicketCreation,
  knowledgeInterceptQuery,
  type CreateTicketDraft,
} from "@/lib/tickets/build-create-ticket-input";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { lookupTicketPriority } from "@/lib/tickets/lookup-ticket-priority";
import {
  nextDraftOriginUnitId,
  resolveCreateTicketOriginUnit,
} from "@/lib/tickets/current-user-origin-unit";
import { ticketText } from "@/lib/tickets/ticket-text";
import { useCreateTicketCatalog } from "@/lib/tickets/use-create-ticket-catalog";
import { usePriorityMatrix } from "@/lib/tickets/use-priority-matrix";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { validateServiceFormData } from "@/lib/tickets/validate-service-form";
import { activeFormVersion, getServiceForm, type FormVersionResponse } from "@/services/service-catalog-api";
import { interceptKnowledgeArticles, resolveKnowledgeIntercept, type KnowledgeInterceptSuggestion } from "@/services/knowledge-base-api";
import { createTicket } from "@/services/tickets-api";

export function CreateTicketForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const catalog = useCreateTicketCatalog();
  const capabilities = useSessionCapabilities();
  const matrixCells = usePriorityMatrix();
  const [draft, setDraft] = useState<CreateTicketDraft>(emptyCreateTicketDraft);
  const [activeForm, setActiveForm] = useState<FormVersionResponse | null>(null);
  const [step, setStep] = useState(0);
  const [suggestions, setSuggestions] = useState<readonly KnowledgeInterceptSuggestion[]>([]);
  const [helped, setHelped] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ReadonlyMap<string, string>>(new Map());
  const [errorKey, setErrorKey] = useState<TicketErrorKey | "tickets.errorCatalog" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasChosenOriginUnit, setHasChosenOriginUnit] = useState(false);
  const displayedError = errorKey ?? catalog.errorKey;
  const isServiceReady = isServiceReadyForTicketCreation(draft, activeForm !== null);
  const selectedService = catalog.services.find((service) => service.id === draft.serviceId) ?? null;
  const suggestedPriority = lookupTicketPriority(draft.impact, draft.urgency, matrixCells);
  const origin = resolveCreateTicketOriginUnit({
    session: capabilities.session,
    originUnits: catalog.originUnits,
  });

  useEffect(() => {
    const nextOriginUnitId = nextDraftOriginUnitId({
      currentOriginUnitId: draft.originUnitId,
      preferredOriginUnitId: origin.preferredOriginUnitId,
      isOriginUnitLocked: !origin.canChooseOriginUnit,
      hasUserChosenOriginUnit: hasChosenOriginUnit,
    });
    if (nextOriginUnitId === draft.originUnitId) {
      return;
    }
    setDraft((current) => ({ ...current, originUnitId: nextOriginUnitId }));
  }, [
    draft.originUnitId,
    hasChosenOriginUnit,
    origin.canChooseOriginUnit,
    origin.preferredOriginUnitId,
  ]);

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
      setHelped(false);
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

  if (catalog.isLoading || capabilities.isLoading) {
    return <PanelSkeleton label={t("tickets.loading")} />;
  }
  if (step === 2 || step === 3) {
    return (
      <CreateTicketFollowUpViews
        step={step}
        draft={draft}
        selectedService={selectedService}
        activeForm={activeForm}
        matrixCells={matrixCells}
        displayedError={displayedError}
        isSubmitting={isSubmitting}
        suggestions={suggestions}
        helped={helped}
        onHelped={() => {
          void resolveKnowledgeIntercept({
            serviceId: draft.serviceId,
            organizationalUnitId: draft.originUnitId,
            articleId: suggestions[0]?.id,
          }).finally(() => setHelped(true));
        }}
        onContinue={() => setStep(3)}
        onBackToDetails={() => setStep(1)}
        onBackToIntercept={() => setStep(2)}
        onSubmit={() => void submitTicket()}
        onCreateAnyway={() => void submitTicket(true)}
      />
    );
  }

  return (
    <CreateTicketDraftView
      step={step}
      draft={draft}
      services={catalog.services}
      originUnits={origin.originUnits}
      canChooseOriginUnit={origin.canChooseOriginUnit}
      originUnitDisplayName={origin.originUnitDisplayName}
      selectedService={selectedService}
      activeForm={activeForm}
      fieldErrors={fieldErrors}
      suggestedPriority={suggestedPriority}
      displayedError={displayedError}
      canNextService={draft.serviceId.length > 0 && isServiceReady}
      canSubmitDetails={isCreateTicketDraftReady(draft) && isServiceReady}
      isSubmitting={isSubmitting}
      onDraftChange={setDraft}
      onOriginUnitChosen={() => setHasChosenOriginUnit(true)}
      onBack={() => setStep(0)}
      onSubmit={(event) => void onSubmit(event)}
    />
  );
}
