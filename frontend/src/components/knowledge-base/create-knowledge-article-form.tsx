import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  KnowledgeArticleAdminFields,
  type KnowledgeClassification,
  type KnowledgeOwnerMode,
} from "@/components/knowledge-base/knowledge-article-admin-fields";
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
import { listGroups, type GroupListItemResponse } from "@/services/groups-api";
import { createKnowledgeArticle } from "@/services/knowledge-base-api";
import type { ServiceResponse } from "@/services/service-catalog-api";

interface CreateKnowledgeArticleFormProperties {
  readonly services: readonly ServiceResponse[];
  readonly originUnits: readonly OriginUnitOption[];
  readonly users: readonly DirectoryUser[];
  readonly isSuperAdmin: boolean;
  readonly initialTitle?: string;
  readonly onCreated: () => Promise<void>;
}

export function CreateKnowledgeArticleForm({
  services,
  originUnits,
  users,
  isSuperAdmin,
  initialTitle = "",
  onCreated,
}: CreateKnowledgeArticleFormProperties) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState("");

  useEffect(() => {
    setTitle(initialTitle);
  }, [initialTitle]);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [organizationalUnitId, setOrganizationalUnitId] = useState(
    defaultOriginUnitId(originUnits),
  );
  const [ownerMode, setOwnerMode] = useState<KnowledgeOwnerMode>("user");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [ownerGroupId, setOwnerGroupId] = useState("");
  const [reviewerUserId, setReviewerUserId] = useState("");
  const [classification, setClassification] =
    useState<KnowledgeClassification>("INTERNAL");
  const [groups, setGroups] = useState<readonly GroupListItemResponse[]>([]);
  const [reason, setReason] = useState("");
  const [errorKey, setErrorKey] = useState<KnowledgeArticleErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) {
      return;
    }
    let cancelled = false;
    void listGroups()
      .then((loaded) => {
        if (!cancelled) {
          setGroups(loaded);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGroups([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin]);

  const adminLabels = useMemo(
    () => ({
      ownerMode: t("knowledgeBase.ownerMode"),
      ownerUser: t("knowledgeBase.ownerUserId"),
      ownerGroup: t("knowledgeBase.ownerGroupId"),
      reviewer: t("knowledgeBase.reviewerUserId"),
      classification: t("knowledgeBase.classification"),
      selectPlaceholder: t("knowledgeBase.selectPlaceholder"),
      ownerModeUser: t("knowledgeBase.ownerModeUser"),
      ownerModeGroup: t("knowledgeBase.ownerModeGroup"),
    }),
    [t],
  );

  const hasOwner =
    ownerMode === "user" ? ownerUserId.length > 0 : ownerGroupId.length > 0;
  const canSubmit =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    serviceId.length > 0 &&
    organizationalUnitId.length > 0 &&
    hasOwner &&
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
        ownerUserId: ownerMode === "user" ? ownerUserId : undefined,
        ownerGroupId: ownerMode === "group" ? ownerGroupId : undefined,
        reviewerUserId:
          isSuperAdmin && reviewerUserId.length > 0
            ? reviewerUserId
            : undefined,
        classification: isSuperAdmin ? classification : undefined,
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
      {isSuperAdmin ? (
        <KnowledgeArticleAdminFields
          users={users}
          groups={groups}
          ownerMode={ownerMode}
          ownerUserId={ownerUserId}
          ownerGroupId={ownerGroupId}
          reviewerUserId={reviewerUserId}
          classification={classification}
          onOwnerModeChange={setOwnerMode}
          onOwnerUserIdChange={setOwnerUserId}
          onOwnerGroupIdChange={setOwnerGroupId}
          onReviewerUserIdChange={setReviewerUserId}
          onClassificationChange={setClassification}
          labels={adminLabels}
        />
      ) : (
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
      )}
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
