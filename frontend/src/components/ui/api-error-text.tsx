import type { ParseKeys } from "i18next";
import { useTranslation } from "react-i18next";
import { errorTextClassName, hintClassName } from "@/components/ui/control";

type TranslationKey = Extract<ParseKeys<"common">, string>;

interface ApiErrorTextProperties {
  /** Translation key selected by the calling domain's error mapper. */
  readonly messageKey: TranslationKey;
  readonly requestId?: string | null;
}

/** Neutral presentation for an already-mapped error message and optional request ID. */
export function ApiErrorText({ messageKey, requestId }: ApiErrorTextProperties) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="grid gap-0.5">
      <p className={errorTextClassName}>{t(messageKey)}</p>
      {requestId ? <p className={hintClassName}>{t("errors.requestId", { requestId })}</p> : null}
    </div>
  );
}
