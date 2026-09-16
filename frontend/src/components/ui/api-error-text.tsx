import { useTranslation } from "react-i18next";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import type { GroupsErrorKey } from "@/lib/groups/map-groups-error";
import type { RbacErrorKey } from "@/lib/rbac/map-rbac-error";
import type { UsersErrorKey } from "@/lib/users/map-users-error";
import type { KnowledgeArticleErrorKey } from "@/lib/knowledge-base/map-knowledge-article-error";
import type { ApiErrorKey } from "@/lib/map-api-error";
import type { RoutingErrorKey } from "@/lib/routing/map-routing-error";
import type { ServiceCategoryErrorKey } from "@/lib/services/map-service-category-error";
import type { TicketErrorKey } from "@/lib/tickets/map-ticket-error";

export type ApiErrorTextKey =
  | ApiErrorKey
  | TicketErrorKey
  | KnowledgeArticleErrorKey
  | RoutingErrorKey
  | ServiceCategoryErrorKey
  | GroupsErrorKey
  | RbacErrorKey
  | UsersErrorKey;

interface ApiErrorTextProperties {
  readonly messageKey: ApiErrorTextKey;
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
