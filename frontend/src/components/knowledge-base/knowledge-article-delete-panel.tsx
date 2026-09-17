import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import {
  mapKnowledgeArticleError,
  type KnowledgeArticleErrorKey,
} from "@/lib/knowledge-base/map-knowledge-article-error";
import { readApiRequestId } from "@/lib/map-api-error";
import { deleteKnowledgeArticle } from "@/services/knowledge-base-api";

interface KnowledgeArticleDeletePanelProperties {
  readonly articleId: string;
  readonly articleTitle: string;
}

export function KnowledgeArticleDeletePanel({
  articleId,
  articleTitle,
}: KnowledgeArticleDeletePanelProperties) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [reason, setReason] = useState("");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorKey, setErrorKey] = useState<KnowledgeArticleErrorKey | null>(
    null,
  );
  const [requestId, setRequestId] = useState<string | null>(null);
  const canDelete = reason.trim().length > 0;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canDelete) {
      return;
    }
    setIsDeleting(true);
    setErrorKey(null);
    setRequestId(null);
    try {
      await deleteKnowledgeArticle(articleId, reason.trim());
      void navigate("/knowledge-base");
    } catch (error) {
      setErrorKey(mapKnowledgeArticleError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isConfirmOpen) {
    return (
      <div className="border-t border-border/50 px-4 py-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setIsConfirmOpen(true)}
        >
          {t("knowledgeBase.deleteAction")}
        </Button>
      </div>
    );
  }

  return (
    <form
      className="grid gap-3 border-t border-danger/30 bg-danger/5 px-4 py-3"
      onSubmit={onSubmit}
    >
      <p className="text-[12px] text-muted-foreground">
        {t("knowledgeBase.deleteConfirm", { title: articleTitle })}
      </p>
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
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          size="sm"
          variant="primary"
          disabled={!canDelete || isDeleting}
        >
          {isDeleting
            ? t("knowledgeBase.deleting")
            : t("knowledgeBase.deleteConfirmAction")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setIsConfirmOpen(false)}
        >
          {t("knowledgeBase.deleteCancel")}
        </Button>
      </div>
    </form>
  );
}
