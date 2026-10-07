import { type FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { mapServiceFormDataError } from "@/lib/tickets/map-service-form-data-error";
import { activeFormVersion, getServiceForm, type FormVersionResponse } from "@/services/service-catalog-api";
import { interceptKnowledgeArticles, resolveKnowledgeIntercept, type KnowledgeInterceptSuggestion } from "@/services/knowledge-base-api";
import { createTicket } from "@/services/tickets-api";

export function CreateTicketForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const catalog = useCreateTicketCatalog();
  const capabilities = useSessionCapabilities();
  const matrixCells = usePriorityMatrix();
  const [searchParams] = useSearchParams();
  // Paket 3.2 (§8): "Report a problem" on My equipment opens the form with the asset.
  const [draft, setDraft] = useState<CreateTicketDraft>(() => ({
    ...emptyCreateTicketDraft,
    assetId: (searchParams.get("assetId") ?? "").slice(0, 64),
    // Paket 3.1 (§10): Teams links services with a required form here, preselected.
    serviceId: (searchParams.get("serviceId") ?? "").slice(0, 64),
  }));
  const [activeForm, setActiveForm] = useState<FormVersionResponse | null>(null);
  const [formsEnabled, setFormsEnabled] = useState(true);
  const [requireVersionOnTicket, setRequireVersionOnTicket] = useState(true);
  const [step, setStep] = useState(0);
  const [suggestions, setSuggestions] = useState<readonly KnowledgeInterceptSuggestion[]>([]);
  const [helped, setHelped] = useState(false);
  // Paket 5.2.4 (M14 B3): remember which article the user marked helpful so
  // that the "resolved by KB" resolution records the right article — we must
  // not silently pick suggestions[0] when the user voted a different one.
  const [helpedArticleId, setHelpedArticleId] = useState<string | null>(null);

  const markHelped = async (articleId?: string | null) => {
    const resolvedId = articleId ?? helpedArticleId ?? suggestions[0]?.id;
    if (!resolvedId) return;
    setHelped(true);
    setHelpedArticleId(resolvedId);
    try {
      await resolveKnowledgeIntercept({
        serviceId: draft.serviceId,
        organizationalUnitId: draft.originUnitId,
        articleId: resolvedId,
      });
    } catch {
      // The "helped" UI is optimistic; a failure still lets the user continue
      // and telemetry is best-effort.
    }
  };
  const [fieldErrors, setFieldErrors] = useState<ReadonlyMap<string, string>>(new Map());
  const [failedSubmitCount, setFailedSubmitCount] = useState(0);
  const [errorKey, setErrorKey] = useState<TicketErrorKey | "tickets.errorCatalog" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasChosenOriginUnit, setHasChosenOriginUnit] = useState(false);
  const displayedError = errorKey ?? catalog.errorKey;
  const isServiceReady = isServiceReadyForTicketCreation(
    draft,
    activeForm !== null,
    formsEnabled,
    requireVersionOnTicket,
  );
  const selectedService = catalog.services.find((service) => service.id === draft.serviceId) ?? null;
  const suggestedPriority = lookupTicketPriority(draft.impact, draft.urgency, matrixCells);
  const origin = resolveCreateTicketOriginUnit({
    session: capabilities.session,
    originUnits: catalog.originUnits,
  });

  const showSubmitError = (error: unknown) => {
    const fieldErrorsFromServer = mapServiceFormDataError(error);
    if (fieldErrorsFromServer === null) {
      setErrorKey(mapTicketError(error));
      return;
    }
    const knownFieldIds = new Set(activeForm?.schema.fields.map((field) => field.id) ?? []);
    const nextFieldErrors = new Map<string, string>();
    let hasUnknownField = false;
    for (const fieldError of fieldErrorsFromServer) {
      if (!knownFieldIds.has(fieldError.fieldId)) {
        hasUnknownField = true;
        continue;
      }
      nextFieldErrors.set(fieldError.fieldId, ticketText(t, fieldError.messageKey));
    }
    setFieldErrors(nextFieldErrors);
    setFailedSubmitCount((count) => count + 1);
    setErrorKey(
      hasUnknownField || nextFieldErrors.size === 0 ? "tickets.errorValidation" : null,
    );
    setStep(1);
  };

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
      setFormsEnabled(true);
      setRequireVersionOnTicket(true);
      return;
    }
    let cancelled = false;
    setActiveForm(null);
    setFormsEnabled(true);
    setRequireVersionOnTicket(true);
    void getServiceForm(draft.serviceId)
      .then((form) => {
        if (cancelled) return;
        setFormsEnabled(form.formsEnabled);
        setRequireVersionOnTicket(form.requireVersionOnTicket);
        const active = form.formsEnabled ? activeFormVersion(form) : null;
        setActiveForm(active);
        setDraft((current) => ({
          ...current,
          formVersionRef: active?.formVersionRef ?? null,
          formData:
            active !== null && current.serviceId === draft.serviceId
              ? current.formData
              : {},
        }));
      })
      .catch(() => {
        if (!cancelled) {
          setActiveForm(null);
          setFormsEnabled(true);
          setRequireVersionOnTicket(true);
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
      setFailedSubmitCount((count) => count + 1);
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
      showSubmitError(error);
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
        helpedArticleId={helpedArticleId}
        onHelped={(articleId) => void markHelped(articleId)}
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
      formsEnabled={formsEnabled}
      requireVersionOnTicket={requireVersionOnTicket}
      fieldErrors={fieldErrors}
      failedSubmitCount={failedSubmitCount}
      suggestedPriority={suggestedPriority}
      displayedError={displayedError}
      canNextService={draft.serviceId.length > 0 && isServiceReady}
      canSubmitDetails={
        isCreateTicketDraftReady(draft, {
          isOriginUnitLocked: !origin.canChooseOriginUnit,
        }) && isServiceReady
      }
      isSubmitting={isSubmitting}
      onDraftChange={setDraft}
      onOriginUnitChosen={() => setHasChosenOriginUnit(true)}
      onBack={() => setStep(0)}
      onSubmit={(event) => void onSubmit(event)}
    />
  );
}
