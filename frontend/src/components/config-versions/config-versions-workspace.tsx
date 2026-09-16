import { History } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfigVersionAdminError } from "@/components/config-versions/config-version-admin-error";
import { ConfigVersionList } from "@/components/config-versions/config-version-list";
import { ConfigVersionStatusTabs } from "@/components/config-versions/config-version-status-tabs";
import { CreateConfigVersionForm } from "@/components/config-versions/create-config-version-form";
import { SelectedConfigVersionPanels } from "@/components/config-versions/selected-config-version-panels";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { filterConfigVersions } from "@/lib/config-versions/config-version-display";
import { mapConfigVersionError } from "@/lib/config-versions/map-config-version-error";
import { useConfigVersionDiff } from "@/lib/config-versions/use-config-version-diff";
import { useConfigVersionShadow } from "@/lib/config-versions/use-config-version-shadow";
import { useConfigVersions } from "@/lib/config-versions/use-config-versions";
import { readApiRequestId } from "@/lib/map-api-error";
import {
  activateConfigVersion,
  createConfigVersion,
  rollbackConfigVersion,
  validateConfigVersion,
  type ConfigValidationResult,
} from "@/services/config-versions-api";
import type { ConfigVersionStatus } from "@/services/config-versions-types";

interface ConfigVersionsWorkspaceProperties {
  readonly canWrite: boolean;
}

export function ConfigVersionsWorkspace({ canWrite }: ConfigVersionsWorkspaceProperties) {
  const { t } = useTranslation();
  const admin = useConfigVersions(true);
  const shadow = useConfigVersionShadow();
  const [statusFilter, setStatusFilter] = useState<ConfigVersionStatus | "ALL">("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [againstId, setAgainstId] = useState<string | null>(null);
  const [validation, setValidation] = useState<ConfigValidationResult | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const visible = filterConfigVersions(admin.versions, statusFilter);
  const selected = admin.versions.find((version) => version.id === selectedId) ?? null;
  const diffState = useConfigVersionDiff(selectedId, againstId);

  useEffect(() => {
    if (selectedId !== null && visible.some((version) => version.id === selectedId)) {
      return;
    }
    setSelectedId(visible[0]?.id ?? null);
    setValidation(null);
    shadow.clear();
  }, [selectedId, shadow.clear, visible]);

  const runAction = async (operation: () => Promise<void>): Promise<boolean> => {
    setIsBusy(true);
    admin.setErrorKey(null);
    admin.setRequestId(null);
    try {
      await operation();
      await admin.load();
      return true;
    } catch (error) {
      admin.setErrorKey(mapConfigVersionError(error));
      admin.setRequestId(readApiRequestId(error));
      return false;
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      {canWrite ? (
        <Card>
          <CardHeader
            title={t("configVersions.createHeading")}
            subtitle={t("configVersions.createHint")}
          />
          <div className="px-4 py-3.5">
            <CreateConfigVersionForm
              isBusy={isBusy}
              onCreate={async (releaseNotes) =>
                runAction(async () => {
                  setSelectedId((await createConfigVersion(releaseNotes)).id);
                  setValidation(null);
                  shadow.clear();
                })
              }
            />
          </div>
        </Card>
      ) : null}
      <Card>
        <CardHeader
          title={t("configVersions.listHeading")}
          subtitle={t("configVersions.listHint")}
        />
        <div className="px-4 py-3.5">
          <ConfigVersionStatusTabs
            active={statusFilter}
            versions={admin.versions}
            onChange={setStatusFilter}
          />
          <ConfigVersionAdminError errorKey={admin.errorKey} requestId={admin.requestId} />
          {admin.isLoading ? (
            <PanelSkeleton className="mt-0" label={t("configVersions.loading")} />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<History size={18} strokeWidth={1.8} />}
              title={t("configVersions.emptyTitle")}
              body={t("configVersions.emptyBody")}
            />
          ) : (
            <ConfigVersionList
              versions={visible}
              selectedId={selectedId}
              onSelect={(versionId) => {
                setSelectedId(versionId);
                setValidation(null);
                shadow.clear();
              }}
            />
          )}
        </div>
      </Card>
      {selected ? (
        <SelectedConfigVersionPanels
          canWrite={canWrite}
          isBusy={isBusy || shadow.isLoading}
          isShadowLoading={shadow.isLoading}
          selected={selected}
          validation={validation}
          shadowResult={shadow.result}
          versions={admin.versions}
          againstId={againstId}
          diffState={diffState}
          onAgainstChange={setAgainstId}
          onValidate={() =>
            void runAction(async () => {
              setValidation(await validateConfigVersion(selected.id));
            })
          }
          onShadow={() => {
            admin.setErrorKey(null);
            admin.setRequestId(null);
            void shadow.run(selected.id, (errorKey, requestId) => {
              admin.setErrorKey(errorKey);
              admin.setRequestId(requestId);
            });
          }}
          onActivate={(reason) =>
            void runAction(async () => {
              await activateConfigVersion(selected.id, reason);
              setValidation(null);
              shadow.clear();
            })
          }
          onRollback={(reason) =>
            void runAction(async () => {
              await rollbackConfigVersion(selected.id, reason);
              setValidation(null);
              shadow.clear();
            })
          }
        />
      ) : null}
    </div>
  );
}
