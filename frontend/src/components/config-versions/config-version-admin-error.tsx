import { useTranslation } from "react-i18next";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import type { ConfigVersionErrorKey } from "@/lib/config-versions/map-config-version-error";

interface ConfigVersionAdminErrorProperties {
  readonly errorKey: ConfigVersionErrorKey | null;
  readonly requestId: string | null;
}

export function ConfigVersionAdminError({
  errorKey,
  requestId,
}: ConfigVersionAdminErrorProperties) {
  const { t } = useTranslation();
  if (errorKey === null) {
    return null;
  }
  return (
    <p className={`${errorTextClassName} mb-3`} role="alert">
      {t(errorKey)}
      {requestId ? (
        <span className={`${hintClassName} mt-0.5 block`}>
          {t("errors.requestId", { requestId })}
        </span>
      ) : null}
    </p>
  );
}
