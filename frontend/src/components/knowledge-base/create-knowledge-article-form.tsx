import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/services/api";
import { createKnowledgeArticle } from "@/services/knowledge-base-api";

interface CreateKnowledgeArticleFormProperties {
  readonly onCreated: () => Promise<void>;
}

export function CreateKnowledgeArticleForm({
  onCreated,
}: CreateKnowledgeArticleFormProperties) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [organizationalUnitId, setOrganizationalUnitId] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [reason, setReason] = useState("");
  const [errorKey, setErrorKey] = useState<
    "knowledgeBase.errorUnauthorized" | "knowledgeBase.errorForbidden" | "knowledgeBase.errorGeneric" | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      await createKnowledgeArticle({
        title,
        body,
        serviceId,
        organizationalUnitId,
        ownerUserId: ownerUserId.length > 0 ? ownerUserId : undefined,
        reason,
      });
      setTitle("");
      setBody("");
      setReason("");
      await onCreated();
    } catch (error) {
      setErrorKey(mapCreateError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="mt-3 grid max-w-xl gap-3" onSubmit={onSubmit}>
      <label className="grid gap-1 text-body">
        {t("knowledgeBase.titleField")}
        <input
          className="h-9 border border-input bg-surface px-2"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
      </label>
      <label className="grid gap-1 text-body">
        {t("knowledgeBase.bodyField")}
        <textarea
          className="min-h-28 border border-input bg-surface px-2 py-2"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          required
        />
      </label>
      <label className="grid gap-1 text-body">
        {t("knowledgeBase.serviceId")}
        <input
          className="h-9 border border-input bg-surface px-2"
          value={serviceId}
          onChange={(event) => setServiceId(event.target.value)}
          required
        />
      </label>
      <label className="grid gap-1 text-body">
        {t("knowledgeBase.organizationalUnitId")}
        <input
          className="h-9 border border-input bg-surface px-2"
          value={organizationalUnitId}
          onChange={(event) => setOrganizationalUnitId(event.target.value)}
          required
        />
      </label>
      <label className="grid gap-1 text-body">
        {t("knowledgeBase.ownerUserId")}
        <input
          className="h-9 border border-input bg-surface px-2"
          value={ownerUserId}
          onChange={(event) => setOwnerUserId(event.target.value)}
          required
        />
      </label>
      <label className="grid gap-1 text-body">
        {t("knowledgeBase.reason")}
        <input
          className="h-9 border border-input bg-surface px-2"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
        />
      </label>
      {errorKey ? <p className="text-body text-destructive">{t(errorKey)}</p> : null}
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("knowledgeBase.saving") : t("knowledgeBase.create")}
        </Button>
      </div>
    </form>
  );
}

function mapCreateError(
  error: unknown,
):
  | "knowledgeBase.errorUnauthorized"
  | "knowledgeBase.errorForbidden"
  | "knowledgeBase.errorGeneric" {
  if (error instanceof ApiError && error.status === 401) {
    return "knowledgeBase.errorUnauthorized";
  }
  if (error instanceof ApiError && error.status === 403) {
    return "knowledgeBase.errorForbidden";
  }
  return "knowledgeBase.errorGeneric";
}
