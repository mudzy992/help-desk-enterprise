import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import type { ModuleCapabilityGateState } from "@/lib/entity-list/module-capability-gate";
import type { ApiErrorKey } from "@/lib/map-api-error";

export function ModuleCapabilityGate({
  state,
  header,
  icon,
  setupTitle,
  setupBody,
  disabledTitle,
  disabledBody,
  forbiddenTitle,
  forbiddenBody,
  errorKey,
  onRetry,
  children,
}: {
  readonly state: ModuleCapabilityGateState;
  readonly header: ReactNode;
  readonly icon: ReactNode;
  readonly setupTitle?: string;
  readonly setupBody?: string;
  readonly disabledTitle: string;
  readonly disabledBody: string;
  readonly forbiddenTitle: string;
  readonly forbiddenBody: string;
  readonly errorKey: ApiErrorKey;
  readonly onRetry: () => void;
  readonly children: ReactNode;
}) {
  const { t } = useTranslation();
  if (state === "ready") return <>{children}</>;
  const copy =
    state === "setup"
      ? { title: setupTitle ?? disabledTitle, body: setupBody ?? disabledBody }
      : state === "forbidden"
        ? { title: forbiddenTitle, body: forbiddenBody }
        : { title: disabledTitle, body: disabledBody };
  return (
    <section>
      {header}
      {state === "loading" ? <PanelSkeleton label={t("ui.loading")} /> : null}
      {state === "error" ? (
        <div className="grid gap-2">
          <ApiErrorText messageKey={errorKey} />
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            {t("ui.retry")}
          </Button>
        </div>
      ) : null}
      {state !== "loading" && state !== "error" ? (
        <EmptyState icon={icon} title={copy.title} body={copy.body} />
      ) : null}
    </section>
  );
}
