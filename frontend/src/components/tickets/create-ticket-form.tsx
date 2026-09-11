import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CreateTicketFields } from "@/components/tickets/create-ticket-fields";
import { KnowledgeInterceptPanel } from "@/components/tickets/knowledge-intercept-panel";
import { TicketErrorState } from "@/components/tickets/ticket-feedback-states";
import { Button } from "@/components/ui/button";
import { PanelSkeleton } from "@/components/ui/skeleton";
import {
  buildCreateTicketInput,
  isCreateTicketDraftReady,
  knowledgeInterceptQuery,
  type CreateTicketDraft,
} from "@/lib/tickets/build-create-ticket-input";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { validateServiceFormData } from "@/lib/tickets/validate-service-form";
import {
  activeFormVersion,
  getServiceForm,
  listOfferedServices,
  type FormVersionResponse,
  type ServiceResponse,
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
  formVersionRef: null,
  formData: {},
};

export function CreateTicketForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<CreateTicketDraft>(emptyDraft);
  const [services, setServices] = useState<readonly ServiceResponse[]>([]);
  const [activeForm, setActiveForm] = useState<FormVersionResponse | null>(null);
  const [step, setStep] = useState<"compose" | "intercept">("compose");
  const [suggestions, setSuggestions] = useState<readonly KnowledgeInterceptSuggestion[]>([]);
  const [helped, setHelped] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ReadonlyMap<string, string>>(new Map());
  const [errorKey, setErrorKey] = useState<TicketErrorKey | "tickets.errorCatalog" | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedService = services.find((service) => service.id === draft.serviceId) ?? null;

  useEffect(() => {
    void listOfferedServices()
      .then(setServices)
      .catch(() => setErrorKey("tickets.errorCatalog"))
      .finally(() => setIsLoading(false));
  }, []);

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

  const submitTicket = async () => {
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      const created = await createTicket(buildCreateTicketInput(draft));
      void navigate(`/tickets/${created.id}`);
    } catch (error) {
      setErrorKey(mapTicketError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <PanelSkeleton label={t("tickets.loading")} />;
  }

  if (step === "intercept") {
    return (
      <div className="mt-4">
        {errorKey ? <TicketErrorState errorKey={errorKey} /> : null}
        <KnowledgeInterceptPanel
          items={suggestions}
          helped={helped}
          onHelped={() => setHelped(true)}
          onContinue={() => void submitTicket()}
          onBack={() => setStep("compose")}
          isSubmitting={isSubmitting}
        />
      </div>
    );
  }

  return (
    <form className="mt-4 grid gap-4" onSubmit={(event) => void runIntercept(event)}>
      <CreateTicketFields
        draft={draft}
        services={services}
        selectedService={selectedService}
        activeForm={activeForm}
        fieldErrors={fieldErrors}
        onChange={setDraft}
      />
      {errorKey ? <TicketErrorState errorKey={errorKey} /> : null}
      <div>
        <Button type="submit" disabled={isSubmitting || !isCreateTicketDraftReady(draft)}>
          {isSubmitting ? t("tickets.checkingKb") : t("tickets.checkKb")}
        </Button>
      </div>
    </form>
  );
}
