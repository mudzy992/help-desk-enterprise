import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { DirectoryUser } from "@/lib/directory/use-directory";
import {
  mapKnowledgeArticleError,
  type KnowledgeArticleErrorKey,
} from "@/lib/knowledge-base/map-knowledge-article-error";
import { readApiRequestId } from "@/lib/map-api-error";
import {
  defaultOriginUnitId,
  type OriginUnitOption,
} from "@/lib/tickets/ticket-display";
import { createKnowledgeArticle } from "@/services/knowledge-base-api";
import type { ServiceResponse } from "@/services/service-catalog-api";

interface CreateKnowledgeArticleFormProperties {
  readonly services: readonly ServiceResponse[];
  readonly originUnits: readonly OriginUnitOption[];
  readonly users: readonly DirectoryUser[];
  readonly onCreated: () => Promise<void>;
}

export function CreateKnowledgeArticleForm({
  services,
  originUnits,
  users,
  onCreated,
}: CreateKnowledgeArticleFormProperties) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [organizationalUnitId, setOrganizationalUnitId] = useState(
    defaultOriginUnitId(originUnits),
  );
  const [ownerUserId, setOwnerUserId] = useState("");
  const [reason, setReason] = useState("");
  const [errorKey, setErrorKey] = useState<KnowledgeArticleErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canSubmit =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    serviceId.length > 0 &&
    organizationalUnitId.length > 0 &&
    ownerUserId.length > 0 &&
    reason.trim().length > 0;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    setIsSubmitting(true);
    setErrorKey(null);
    setRequestId(null);
    try {
      await createKnowledgeArticle({
        title: title.trim(),
        body: body.trim(),
        serviceId,
        organizationalUnitId,
        ownerUserId,
        reason: reason.trim(),
      });
      await onCreated();
    } catch (error) {
      setErrorKey(mapKnowledgeArticleError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="mt-4 grid gap-3" onSubmit={onSubmit}>
      <Field label={t("knowledgeBase.titleField")} required>
        <Input
          value={title}
          required
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>
      <Field label={t("knowledgeBase.bodyField")} required>
        <Textarea
          value={body}
          required
          maxLength={20000}
          className="min-h-32"
          onChange={(event) => setBody(event.target.value)}
        />
      </Field>
      <Field label={t("knowledgeBase.serviceId")} required>
        <Select
          value={serviceId}
          required
          onChange={(event) => setServiceId(event.target.value)}
        >
          <option value="">{t("knowledgeBase.selectPlaceholder")}</option>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("knowledgeBase.organizationalUnitId")} required>
        <Select
          value={organizationalUnitId}
          required
          onChange={(event) => setOrganizationalUnitId(event.target.value)}
        >
          <option value="">{t("knowledgeBase.selectPlaceholder")}</option>
          {originUnits.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("knowledgeBase.ownerUserId")} required>
        <Select
          value={ownerUserId}
          required
          onChange={(event) => setOwnerUserId(event.target.value)}
        >
          <option value="">{t("knowledgeBase.selectPlaceholder")}</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.displayName}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("knowledgeBase.reason")} required>
        <Input
          value={reason}
          required
          maxLength={512}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      {errorKey ? (
        <ApiErrorText messageKey={errorKey} requestId={requestId} />
      ) : null}
      <div>
        <Button type="submit" disabled={!canSubmit || isSubmitting}>
          {isSubmitting ? t("knowledgeBase.saving") : t("knowledgeBase.create")}
        </Button>
      </div>
    </form>
  );
}
