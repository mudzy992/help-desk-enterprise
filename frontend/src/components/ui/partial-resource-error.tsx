import type { ParseKeys } from "i18next";
import { useTranslation } from "react-i18next";

type TranslationKey = Extract<ParseKeys<"common">, string>;
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";

export function PartialResourceError({
  messageKey,
  requestId,
  retry,
}: {
  readonly messageKey: TranslationKey;
  readonly requestId: string | null;
  readonly retry: () => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ApiErrorText messageKey={messageKey} requestId={requestId} />
      <Button type="button" size="xs" variant="outline" onClick={() => void retry()}>
        {t("ui.retry")}
      </Button>
    </div>
  );
}
