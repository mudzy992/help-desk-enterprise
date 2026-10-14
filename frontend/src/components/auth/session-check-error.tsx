import { useTranslation } from "react-i18next";
import { GateStatusError } from "@/components/layout/gate-status-error";

interface SessionCheckErrorProperties {
  readonly onRetry: () => void;
}

/**
 * Shown when `/auth/session` cannot be answered. The user is still signed in
 * (only a 401 ends a session), so the only action offered is to try again.
 */
export function SessionCheckError({ onRetry }: SessionCheckErrorProperties) {
  const { t } = useTranslation();

  return (
    <GateStatusError
      title={t("session.checkError.title")}
      body={t("session.checkError.body")}
      retryLabel={t("session.checkError.retry")}
      onRetry={onRetry}
    />
  );
}
