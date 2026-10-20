import type { ParseKeys } from "i18next";
import { useTranslation } from "react-i18next";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";

type TranslationKey = Extract<ParseKeys<"common">, string>;

export function EntityDetailQueryError({
  messageKey,
  requestId,
  retrying,
  onRetry,
}: {
  readonly messageKey: TranslationKey;
  readonly requestId: string | null;
  readonly retrying: boolean;
  readonly onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid justify-items-start gap-2">
      <ApiErrorText messageKey={messageKey} requestId={requestId} />
      <Button type="button" size="sm" variant="outline" disabled={retrying} onClick={onRetry}>
        {retrying ? t("ui.loading") : t("ui.retry")}
      </Button>
    </div>
  );
}
