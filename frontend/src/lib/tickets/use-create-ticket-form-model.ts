import { type FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import { fetchKnowledgeInterceptStep } from "@/lib/tickets/fetch-knowledge-intercept-step";
import { useCreateTicketCatalog } from "@/lib/tickets/use-create-ticket-catalog";
import { usePriorityMatrix } from "@/lib/tickets/use-priority-matrix";
import { useCreateTicketDraftPersistence } from "@/lib/tickets/use-create-ticket-draft-persistence";
import { clearSessionValue, createTicketDraftStorageKey } from "@/lib/tickets/ticket-draft-storage";
import { useSession } from "@/lib/session/use-session";
import { useCreateTicketServiceForm } from "@/lib/tickets/use-create-ticket-service-form";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { validateServiceFormData } from "@/lib/tickets/validate-service-form";
import { mapServiceFormDataError } from "@/lib/tickets/map-service-form-data-error";
import {
  resolveKnowledgeIntercept,
  type KnowledgeInterceptSuggestion,
} from "@/services/knowledge-base-api";
import { createTicket } from "@/services/tickets-api";

export function useCreateTicketFormModel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const catalog = useCreateTicketCatalog();
  const { currentUserId } = useSession();
  const capabilities = useSessionCapabilities();
  const matrixCells = usePriorityMatrix();
  const [searchParams] = useSearchParams();
  const hasDeepLinkPrefill =
    searchParams.get("assetId") !== null || searchParams.get("serviceId") !== null;
  // "Report a problem" on My equipment opens the form with the asset.
  const [draft, setDraft] = useState<CreateTicketDraft>(() => ({
    ...emptyCreateTicketDraft,
    assetId: (searchParams.get("assetId") ?? "").slice(0, 64),
    // Teams links services with a required form here, preselected.
    serviceId: (searchParams.get("serviceId") ?? "").slice(0, 64),
  }));
  const [step, setStep] = useState(0);
  const [suggestions, setSuggestions] = useState<readonly KnowledgeInterceptSuggestion[]>([]);
  /** Ako poziv bazi znanja ne uspije, korak prikazuje da je nedostupna. */
  const [interceptUnavailable, setInterceptUnavailable] = useState(false);
  const [helped, setHelped] = useState(false);
  // remember which article the user marked helpful so
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

  const resetHelped = () => {
    setHelped(false);
    setHelpedArticleId(null);
  };

  const [fieldErrors, setFieldErrors] = useState<ReadonlyMap<string, string>>(new Map());
  const [failedSubmitCount, setFailedSubmitCount] = useState(0);
  const [errorKey, setErrorKey] = useState<TicketErrorKey | "tickets.errorCatalog" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasChosenOriginUnit, setHasChosenOriginUnit] = useState(false);
  const draftOwner = useRef(currentUserId);
  useEffect(() => {
    if (draftOwner.current === currentUserId) return;
    draftOwner.current = currentUserId;
    setDraft({
      ...emptyCreateTicketDraft,
      assetId: (searchParams.get("assetId") ?? "").slice(0, 64),
      serviceId: (searchParams.get("serviceId") ?? "").slice(0, 64),
    });
    setStep(0);
    setSuggestions([]);
    setInterceptUnavailable(false);
    setHelped(false);
    setHelpedArticleId(null);
    setFieldErrors(new Map());
    setErrorKey(null);
    setHasChosenOriginUnit(false);
  }, [currentUserId, searchParams]);
  const { activeForm, formsEnabled, requireVersionOnTicket } = useCreateTicketServiceForm({
    serviceId: draft.serviceId,
    setDraft,
    setErrorKey,
  });
  const displayedError = errorKey ?? catalog.errorKey;
  const isServiceReady = isServiceReadyForTicketCreation(
    draft,
    activeForm !== null,
    formsEnabled,
    requireVersionOnTicket,
  );
  const selectedService =
    catalog.services.find((service) => service.id === draft.serviceId) ?? null;
  const suggestedPriority = lookupTicketPriority(draft.impact, draft.urgency, matrixCells);
  const origin = resolveCreateTicketOriginUnit({
    session: capabilities.session,
    originUnits: catalog.originUnits,
  });
  useCreateTicketDraftPersistence({
    isCatalogLoading: catalog.isLoading,
    hasDeepLinkPrefill,
    services: catalog.services,
    selectedService,
    draft,
    setDraft,
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
      nextFieldErrors.set(fieldError.fieldId, t(fieldError.messageKey));
    }
    setFieldErrors(nextFieldErrors);
    setFailedSubmitCount((count) => count + 1);
    setErrorKey(hasUnknownField || nextFieldErrors.size === 0 ? "tickets.errorValidation" : null);
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

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step === 0) {
      setStep(1);
      return;
    }
    const schemaErrors = validateServiceFormData(activeForm?.schema ?? null, draft.formData);
    if (schemaErrors.length > 0) {
      setFieldErrors(new Map(schemaErrors.map((item) => [item.fieldId, t(item.messageKey)])));
      setFailedSubmitCount((count) => count + 1);
      return;
    }
    setFieldErrors(new Map());
    setIsSubmitting(true);
    setErrorKey(null);
    setInterceptUnavailable(false);
    try {
      const interceptStep = await fetchKnowledgeInterceptStep({
        serviceId: draft.serviceId,
        query: knowledgeInterceptQuery(draft),
      });
      setSuggestions(interceptStep.kind === "suggestions" ? interceptStep.articles : []);
      setHelped(false);
      setInterceptUnavailable(interceptStep.kind === "unavailable");
      setStep(2);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitTicket = async (acknowledgeDuplicate = false) => {
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      const created = await createTicket(buildCreateTicketInput(draft, { acknowledgeDuplicate }));
      if (currentUserId !== null) {
        clearSessionValue(createTicketDraftStorageKey(currentUserId));
      }
      void navigate(`/tickets/${created.id}`);
    } catch (error) {
      showSubmitError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    isLoading: catalog.isLoading || capabilities.isLoading,
    step,
    followUpView: {
      step,
      draft,
      selectedService,
      activeForm,
      matrixCells,
      displayedError,
      isSubmitting,
      isInterceptUnavailable: interceptUnavailable,
      suggestions,
      helped,
      helpedArticleId,
      onHelped: (articleId?: string | null) => void markHelped(articleId),
      onResetHelped: resetHelped,
      onContinue: () => setStep(3),
      onBackToDetails: () => setStep(1),
      onBackToIntercept: () => setStep(2),
      onSubmit: () => void submitTicket(),
      onCreateAnyway: () => void submitTicket(true),
    },
    draftView: {
      step,
      draft,
      services: catalog.services,
      originUnits: origin.originUnits,
      canChooseOriginUnit: origin.canChooseOriginUnit,
      originUnitDisplayName: origin.originUnitDisplayName,
      selectedService,
      activeForm,
      formsEnabled,
      requireVersionOnTicket,
      fieldErrors,
      failedSubmitCount,
      suggestedPriority,
      displayedError,
      canNextService: draft.serviceId.length > 0 && isServiceReady,
      canSubmitDetails:
        isCreateTicketDraftReady(draft, {
          isOriginUnitLocked: !origin.canChooseOriginUnit,
        }) && isServiceReady,
      isSubmitting,
      onDraftChange: setDraft,
      onOriginUnitChosen: () => setHasChosenOriginUnit(true),
      onBack: () => setStep(0),
      onSubmit: (event: FormEvent<HTMLFormElement>) => void onSubmit(event),
    },
  };
}
