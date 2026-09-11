import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  controlClassName,
  errorTextClassName,
  labelClassName,
  textareaClassName,
} from "@/components/ui/control";
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
    <form className="grid max-w-xl gap-3" onSubmit={onSubmit}>
      <label className={labelClassName}>
        {t("knowledgeBase.titleField")}
        <input
          className={controlClassName}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
      </label>
      <label className={labelClassName}>
        {t("knowledgeBase.bodyField")}
        <textarea
          className={textareaClassName}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          required
        />
      </label>
      <label className={labelClassName}>
        {t("knowledgeBase.serviceId")}
        <input
          className={controlClassName}
          value={serviceId}
          onChange={(event) => setServiceId(event.target.value)}
          required
        />
      </label>
      <label className={labelClassName}>
        {t("knowledgeBase.organizationalUnitId")}
        <input
          className={controlClassName}
          value={organizationalUnitId}
          onChange={(event) => setOrganizationalUnitId(event.target.value)}
          required
        />
      </label>
      <label className={labelClassName}>
        {t("knowledgeBase.ownerUserId")}
        <input
          className={controlClassName}
          value={ownerUserId}
          onChange={(event) => setOwnerUserId(event.target.value)}
          required
        />
      </label>
      <label className={labelClassName}>
        {t("knowledgeBase.reason")}
        <input
          className={controlClassName}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
        />
      </label>
      {errorKey ? <p className={errorTextClassName}>{t(errorKey)}</p> : null}
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
