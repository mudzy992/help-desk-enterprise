import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { installStepRequestId } from "@/lib/install/use-install-step-resource";

/**
 * Install wizard v2 (F0.2/IN3): shown instead of a step form whose state could
 * not be read. The request id is the string the operator can quote, and `retry`
 * is the only action — a form built on unknown state would overwrite whatever
 * the installation already has.
 */
export function InstallStepLoadError({
  error,
  onRetry,
}: {
  readonly error: unknown;
  readonly onRetry: () => void;
}) {
  const { t } = useTranslation();
  const requestId = installStepRequestId(error);
  return (
    <div
      role="alert"
      className="grid gap-2 rounded-lg border border-danger/40 bg-danger/5 px-4 py-3"
    >
      <p className={errorTextClassName}>{t("install.stepLoadError")}</p>
      {requestId !== null ? (
        <p className="text-[11.5px] leading-5 text-muted-foreground">
          {t("install.requestId", { requestId })}
        </p>
      ) : null}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          {t("install.retry")}
        </Button>
      </div>
    </div>
  );
}
