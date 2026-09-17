import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  KnowledgeArticleAdminFields,
  type KnowledgeClassification,
  type KnowledgeOwnerMode,
  knowledgeClassificationValues,
} from "@/components/knowledge-base/knowledge-article-admin-fields";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ApiErrorText } from "@/components/ui/api-error-text";
import type { DirectoryUser } from "@/lib/directory/use-directory";
import {
  mapKnowledgeArticleError,
  type KnowledgeArticleErrorKey,
} from "@/lib/knowledge-base/map-knowledge-article-error";
import { readApiRequestId } from "@/lib/map-api-error";
import { listGroups, type GroupListItemResponse } from "@/services/groups-api";
import {
  updateKnowledgeArticle,
  type KnowledgeArticleResponse,
} from "@/services/knowledge-base-api";

interface KnowledgeArticleEditFormProperties {
  readonly article: KnowledgeArticleResponse;
  readonly users: readonly DirectoryUser[];
  readonly isSuperAdmin: boolean;
  readonly onSaved: () => Promise<void>;
}

function readClassification(
  value: string,
): KnowledgeClassification {
  return knowledgeClassificationValues.includes(
    value as KnowledgeClassification,
  )
    ? (value as KnowledgeClassification)
    : "INTERNAL";
}

export function KnowledgeArticleEditForm({
  article,
  users,
  isSuperAdmin,
  onSaved,
}: KnowledgeArticleEditFormProperties) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(article.title);
  const [body, setBody] = useState(article.body);
  const [ownerMode, setOwnerMode] = useState<KnowledgeOwnerMode>(
    article.ownerGroupId ? "group" : "user",
  );
  const [ownerUserId, setOwnerUserId] = useState(article.ownerUserId ?? "");
  const [ownerGroupId, setOwnerGroupId] = useState(article.ownerGroupId ?? "");
  const [reviewerUserId, setReviewerUserId] = useState(
    article.reviewerUserId ?? "",
  );
  const [classification, setClassification] = useState<KnowledgeClassification>(
    readClassification(article.classification),
  );
  const [groups, setGroups] = useState<readonly GroupListItemResponse[]>([]);
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<KnowledgeArticleErrorKey | null>(
    null,
  );
  const [requestId, setRequestId] = useState<string | null>(null);

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
    !isSuperAdmin ||
    (ownerMode === "user"
      ? ownerUserId.length > 0
      : ownerGroupId.length > 0);
  const canSubmit =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    reason.trim().length > 0 &&
    hasOwner;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    setIsSaving(true);
    setErrorKey(null);
    setRequestId(null);
    try {
      await updateKnowledgeArticle(article.id, {
        title: title.trim(),
        body: body.trim(),
        reason: reason.trim(),
        ...(isSuperAdmin
          ? {
              ownerUserId: ownerMode === "user" ? ownerUserId : null,
              ownerGroupId: ownerMode === "group" ? ownerGroupId : null,
              reviewerUserId:
                reviewerUserId.length > 0 ? reviewerUserId : null,
              classification,
            }
          : {}),
      });
      setReason("");
      await onSaved();
    } catch (error) {
      setErrorKey(mapKnowledgeArticleError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="grid gap-3" onSubmit={onSubmit}>
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
          className="min-h-48"
          onChange={(event) => setBody(event.target.value)}
        />
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
      ) : null}
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
        <Button type="submit" disabled={!canSubmit || isSaving}>
          {isSaving ? t("knowledgeBase.saving") : t("knowledgeBase.save")}
        </Button>
      </div>
    </form>
  );
}
