import { useTranslation } from "react-i18next";
import { ConfigValidationErrors } from "@/components/config-versions/config-validation-errors";
import { ConfigVersionActions } from "@/components/config-versions/config-version-actions";
import { ConfigVersionDiffPanel } from "@/components/config-versions/config-version-diff-panel";
import { Card, CardHeader } from "@/components/ui/card";
import type { useConfigVersionDiff } from "@/lib/config-versions/use-config-version-diff";
import type {
  ConfigValidationResult,
  ConfigVersion,
} from "@/services/config-versions-types";

interface SelectedConfigVersionPanelsProperties {
  readonly selected: ConfigVersion;
  readonly canWrite: boolean;
  readonly isBusy: boolean;
  readonly validation: ConfigValidationResult | null;
  readonly versions: readonly ConfigVersion[];
  readonly againstId: string | null;
  readonly diffState: ReturnType<typeof useConfigVersionDiff>;
  readonly onAgainstChange: (againstId: string | null) => void;
  readonly onValidate: () => void;
  readonly onActivate: (reason: string) => void;
  readonly onRollback: (reason: string) => void;
}

export function SelectedConfigVersionPanels({
  selected,
  canWrite,
  isBusy,
  validation,
  versions,
  againstId,
  diffState,
  onAgainstChange,
  onValidate,
  onActivate,
  onRollback,
}: SelectedConfigVersionPanelsProperties) {
  const { t } = useTranslation();

  return (
    <>
      <Card>
        <CardHeader
          title={t("configVersions.selectedHeading", { version: selected.version })}
          subtitle={t(`configVersions.statuses.${selected.status}`)}
        />
        <div className="grid gap-4 px-4 py-3.5">
          <ConfigVersionActions
            version={selected}
            canWrite={canWrite}
            isBusy={isBusy}
            onValidate={onValidate}
            onActivate={onActivate}
            onRollback={onRollback}
          />
          {validation ? <ConfigValidationErrors issues={validation.errors} /> : null}
        </div>
      </Card>
      <Card>
        <CardHeader title={t("configVersions.diffHeading")} subtitle={t("configVersions.diffHint")} />
        <div className="px-4 py-3.5">
          <ConfigVersionDiffPanel
            versions={versions}
            selectedId={selected.id}
            againstId={againstId}
            onAgainstChange={onAgainstChange}
            diffState={diffState}
          />
        </div>
      </Card>
    </>
  );
}
