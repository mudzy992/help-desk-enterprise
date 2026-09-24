import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { controlClassName, hintClassName } from "@/components/ui/control";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { knowledgeLifecycleOptions } from "@/lib/knowledge-base/knowledge-lifecycle-actions";
import type {
  KnowledgeArticleStatus,
  KnowledgeLifecycleAction,
} from "@/services/knowledge-base-api";
import { runKnowledgeLifecycleAction } from "@/services/knowledge-base-api";

interface KnowledgeLifecycleActionsProperties {
  readonly articleId: string;
  readonly status: KnowledgeArticleStatus;
  readonly canManage: boolean;
  readonly onChanged: () => Promise<void>;
}

export function KnowledgeLifecycleActions({
  articleId,
  status,
  canManage,
  onChanged,
}: KnowledgeLifecycleActionsProperties) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [pendingAction, setPendingAction] =
    useState<KnowledgeLifecycleAction | null>(null);
  const [errorKey, setErrorKey] = useState<ApiErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const options = knowledgeLifecycleOptions(status, canManage);
  if (options.length === 0) {
    return null;
  }

  const run = async (action: KnowledgeLifecycleAction) => {
    setPendingAction(action);
    setErrorKey(null);
    setRequestId(null);
    try {
      await runKnowledgeLifecycleAction(articleId, action, reason.trim());
      setReason("");
      await onChanged();
    } catch (error) {
      setErrorKey(mapApiError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setPendingAction(null);
    }
  };

  const isReasonMissing = reason.trim().length === 0;
  return (
    <div className="grid gap-2 border-t border-border/70 pt-2">
      <label className="grid gap-1">
        <span className={hintClassName}>{t("knowledgeBase.reasonLabel")}</span>
        <input
          className={controlClassName}
          value={reason}
          maxLength={512}
          placeholder={t("knowledgeBase.reasonPlaceholder")}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.action}
            type="button"
            variant="outline"
            size="sm"
            disabled={isReasonMissing || pendingAction !== null}
            onClick={() => {
              void run(option.action);
            }}
          >
            {t(option.labelKey)}
          </Button>
        ))}
      </div>
      {errorKey ? (
        <ApiErrorText messageKey={errorKey} requestId={requestId} />
      ) : null}
    </div>
  );
}
