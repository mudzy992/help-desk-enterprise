import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { KnowledgeInterceptResults } from "@/components/tickets/knowledge-intercept-results";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/services/api";
import { interceptKnowledgeArticles } from "@/services/knowledge-base-api";
import type { KnowledgeInterceptSuggestion } from "@/services/knowledge-base-api";
import { createTicket } from "@/services/tickets-api";

export function CreateTicketWithInterceptForm() {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [step, setStep] = useState<"compose" | "intercept" | "done">("compose");
  const [suggestions, setSuggestions] = useState<
    readonly KnowledgeInterceptSuggestion[]
  >([]);
  const [helped, setHelped] = useState(false);
  const [errorKey, setErrorKey] = useState<
    "tickets.errorUnauthorized" | "tickets.errorGeneric" | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onLookup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      const result = await interceptKnowledgeArticles({
        serviceId,
        query: `${title} ${description}`,
      });
      setSuggestions(result.articles);
      setStep("intercept");
    } catch (error) {
      setErrorKey(
        error instanceof ApiError && error.status === 401
          ? "tickets.errorUnauthorized"
          : "tickets.errorGeneric",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const onCreate = async () => {
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      await createTicket({
        title,
        description,
        impact: "MEDIUM",
        urgency: "MEDIUM",
        serviceId,
      });
      setStep("done");
    } catch (error) {
      setErrorKey(
        error instanceof ApiError && error.status === 401
          ? "tickets.errorUnauthorized"
          : "tickets.errorGeneric",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (step === "done") {
    return <p className="mt-3 text-body">{t("tickets.created")}</p>;
  }

  if (step === "intercept") {
    if (helped) {
      return (
        <div className="mt-3 grid gap-3">
          <p className="text-body">{t("tickets.helpedSkip")}</p>
          <Button type="button" variant="secondary" onClick={() => void onCreate()}>
            {t("tickets.continueCreate")}
          </Button>
        </div>
      );
    }
    return (
      <KnowledgeInterceptResults
        items={suggestions}
        onHelped={() => setHelped(true)}
        onContinue={() => void onCreate()}
      />
    );
  }

  return (
    <form className="mt-3 grid max-w-xl gap-3" onSubmit={onLookup}>
      <label className="grid gap-1 text-body">
        {t("tickets.titleField")}
        <input
          className="h-9 border border-input bg-surface px-2"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
      </label>
      <label className="grid gap-1 text-body">
        {t("tickets.descriptionField")}
        <textarea
          className="min-h-28 border border-input bg-surface px-2 py-2"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          required
        />
      </label>
      <label className="grid gap-1 text-body">
        {t("tickets.serviceId")}
        <input
          className="h-9 border border-input bg-surface px-2"
          value={serviceId}
          onChange={(event) => setServiceId(event.target.value)}
          required
        />
      </label>
      {errorKey ? <p className="text-body text-destructive">{t(errorKey)}</p> : null}
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("tickets.checkingKb") : t("tickets.checkKb")}
        </Button>
      </div>
    </form>
  );
}
