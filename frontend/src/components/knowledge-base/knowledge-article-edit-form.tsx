import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ApiErrorText } from "@/components/ui/api-error-text";
import {
  mapKnowledgeArticleError,
  type KnowledgeArticleErrorKey,
} from "@/lib/knowledge-base/map-knowledge-article-error";
import { readApiRequestId } from "@/lib/map-api-error";
import {
  updateKnowledgeArticle,
  type KnowledgeArticleResponse,
} from "@/services/knowledge-base-api";

interface KnowledgeArticleEditFormProperties {
  readonly article: KnowledgeArticleResponse;
  readonly onSaved: () => Promise<void>;
}

export function KnowledgeArticleEditForm({
  article,
  onSaved,
}: KnowledgeArticleEditFormProperties) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(article.title);
  const [body, setBody] = useState(article.body);
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<KnowledgeArticleErrorKey | null>(
    null,
  );
  const [requestId, setRequestId] = useState<string | null>(null);
  const canSubmit = title.trim().length > 0 && body.trim().length > 0 && reason.trim().length > 0;

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
