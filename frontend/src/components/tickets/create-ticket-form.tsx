import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CreateTicketFields } from "@/components/tickets/create-ticket-fields";
import { CreateTicketInterceptView } from "@/components/tickets/create-ticket-intercept-view";
import { TicketErrorState } from "@/components/tickets/ticket-feedback-states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { WizardStepper } from "@/components/ui/wizard-stepper";
import {
  buildCreateTicketInput,
  isCreateTicketDraftReady,
  isServiceReadyForTicketCreation,
  knowledgeInterceptQuery,
  type CreateTicketDraft,
} from "@/lib/tickets/build-create-ticket-input";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { defaultOriginUnitId } from "@/lib/tickets/ticket-display";
import { useCreateTicketCatalog } from "@/lib/tickets/use-create-ticket-catalog";
import { validateServiceFormData } from "@/lib/tickets/validate-service-form";
import {
  activeFormVersion,
  getServiceForm,
  type FormVersionResponse,
} from "@/services/service-catalog-api";
import { interceptKnowledgeArticles } from "@/services/knowledge-base-api";
import type { KnowledgeInterceptSuggestion } from "@/services/knowledge-base-api";
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
  const [step, setStep] = useState<"compose" | "intercept">("compose");
  const [suggestions, setSuggestions] = useState<readonly KnowledgeInterceptSuggestion[]>([]);
  const [helped, setHelped] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ReadonlyMap<string, string>>(new Map());
  const [errorKey, setErrorKey] = useState<TicketErrorKey | "tickets.errorCatalog" | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedService =
    catalog.services.find((service) => service.id === draft.serviceId) ?? null;
  const displayedError = errorKey ?? catalog.errorKey;
  const isServiceReady = isServiceReadyForTicketCreation(
    draft,
    activeForm !== null,
  );

  useEffect(() => {
    const fallback = defaultOriginUnitId(catalog.originUnits);
    if (fallback.length === 0) {
      return;
    }
    setDraft((current) =>
      current.originUnitId.length > 0
        ? current
        : { ...current, originUnitId: fallback },
    );
  }, [catalog.originUnits]);

  useEffect(() => {
    if (draft.serviceId.length === 0) {
      setActiveForm(null);
      return;
    }
    let cancelled = false;
    void getServiceForm(draft.serviceId)
      .then((form) => {
        if (cancelled) {
          return;
        }
        const active = activeFormVersion(form);
        setActiveForm(active);
        setDraft((current) => ({
          ...current,
          formVersionRef: active?.formVersionRef ?? null,
          formData: current.serviceId === draft.serviceId ? current.formData : {},
        }));
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setActiveForm(null);
        setErrorKey("tickets.errorCatalog");
      });
    return () => {
      cancelled = true;
    };
  }, [draft.serviceId]);

  const runIntercept = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const schemaErrors = validateServiceFormData(activeForm?.schema ?? null, draft.formData);
    if (schemaErrors.length > 0) {
      setFieldErrors(
        new Map(schemaErrors.map((item) => [item.fieldId, t(item.messageKey)])),
      );
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
      setStep("intercept");
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
      const created = await createTicket(
        buildCreateTicketInput(draft, { acknowledgeDuplicate }),
      );
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

  if (step === "intercept") {
    return (
      <CreateTicketInterceptView
        displayedError={displayedError}
        isSubmitting={isSubmitting}
        items={suggestions}
        helped={helped}
        onHelped={() => setHelped(true)}
        onContinue={() => void submitTicket()}
        onBack={() => setStep("compose")}
        onCreateAnyway={() => void submitTicket(true)}
      />
    );
  }

  return (
    <form className="mt-1 grid gap-4" onSubmit={(event) => void runIntercept(event)}>
      <WizardStepper
        steps={[
          { key: "compose", label: t("tickets.createStepDetails") },
          { key: "intercept", label: t("tickets.createStepKnowledge") },
        ]}
        activeIndex={0}
      />
      <Card className="px-4 py-4">
        <CreateTicketFields
          draft={draft}
          services={catalog.services}
          originUnits={catalog.originUnits}
          selectedService={selectedService}
          activeForm={activeForm}
          fieldErrors={fieldErrors}
          onChange={setDraft}
        />
        {displayedError ? <div className="mt-4"><TicketErrorState errorKey={displayedError} /></div> : null}
        <div className="mt-4">
          <Button
            type="submit"
            disabled={
              isSubmitting || !isCreateTicketDraftReady(draft) || !isServiceReady
            }
          >
            {isSubmitting ? t("tickets.checkingKb") : t("tickets.checkKb")}
          </Button>
        </div>
      </Card>
    </form>
  );
}
