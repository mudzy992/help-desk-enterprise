import { useTranslation } from "react-i18next";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import type { KnowledgeArticleErrorKey } from "@/lib/knowledge-base/map-knowledge-article-error";
import type { ApiErrorKey } from "@/lib/map-api-error";
import type { TicketErrorKey } from "@/lib/tickets/map-ticket-error";

interface ApiErrorTextProperties {
  readonly messageKey: ApiErrorKey | TicketErrorKey | KnowledgeArticleErrorKey;
  readonly requestId?: string | null;
}

export function ApiErrorText({ messageKey, requestId }: ApiErrorTextProperties) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="grid gap-0.5">
      <p className={errorTextClassName}>{t(messageKey)}</p>
      {requestId ? (
        <p className={hintClassName}>{t("errors.requestId", { requestId })}</p>
      ) : null}
    </div>
  );
}
