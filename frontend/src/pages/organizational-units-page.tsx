import { Network, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DirectorySyncCard } from "@/components/organizational-units/directory-sync-card";
import { LdapsDirectorySyncPanel } from "@/components/organizational-units/ldaps-directory-sync-panel";
import { OrganizationalUnitDetailsCard } from "@/components/organizational-units/organizational-unit-details-card";
import { OrganizationalUnitFormDrawer } from "@/components/organizational-units/organizational-unit-form-drawer";
import { OrganizationalUnitTree } from "@/components/organizational-units/organizational-unit-tree";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { errorTextClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { countOrganizationalUnitMembers } from "@/lib/directory/count-organizational-unit-members";
import { findOrganizationalUnitNode } from "@/lib/directory/find-organizational-unit-node";
import { useDirectory } from "@/lib/directory/use-directory";
import { useManualDirectoryCatalogActions } from "@/lib/directory/use-manual-directory-catalog-actions";
import { roleKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import type {
  DirectorySyncStatus,
  ManualDirectoryOrganizationalUnit,
} from "@/services/directory-sync-api";

interface OrganizationalUnitsPageProperties {
  readonly embedded?: boolean;
}

export function OrganizationalUnitsPage({
  embedded = false,
}: OrganizationalUnitsPageProperties) {
  const { t } = useTranslation();
  const directory = useDirectory();
  const { session, hasRole } = useSessionCapabilities();
  const canManage =
    session?.isSuperAdmin === true || hasRole(roleKeys.superAdmin);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<DirectorySyncStatus | null>(null);
  const [syncReloadToken, setSyncReloadToken] = useState(0);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingUnit, setEditingUnit] =
    useState<ManualDirectoryOrganizationalUnit | null>(null);
  const catalogActions = useManualDirectoryCatalogActions({
    canManage,
    reloadDirectory: directory.reload,
  });
  const selectedNode =
    findOrganizationalUnitNode(directory.tree, selectedId) ??
    directory.tree[0] ??
    null;

  return (
    <section>
      {embedded ? null : (
        <PageHeader
          crumbs={["EP-HelpDesk", t("navigation.organizationalUnits")]}
          title={t("navigation.organizationalUnits")}
          subtitle={t("directory.unitsIntro")}
        />
      )}
      {directory.isLoading ? (
        <Card>
          <CardHeader title={t("directory.unitsHeading")} subtitle={t("directory.unitsHint")} />
          <div className="px-4 py-3.5">
            <PanelSkeleton className="mt-0" label={t("directory.unitsHeading")} />
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
          <Card>
            <CardHeader
              title={t("directory.unitsHeading")}
              subtitle={t("directory.unitsHint")}
              actions={
                canManage ? (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      setFormMode("create");
                      setEditingUnit(null);
                      setFormOpen(true);
                    }}
                  >
                    <Plus size={12} /> {t("directory.ouAdd")}
                  </Button>
                ) : null
              }
            />
            <p className="px-4 pb-2 text-[11.5px] text-muted-foreground">
              {t("directory.catalogTwoStepHint")}
            </p>
            {directory.errorKey ? (
              <div className="px-4 py-3.5">
                <ApiErrorText messageKey={directory.errorKey} requestId={directory.requestId} />
              </div>
            ) : directory.tree.length === 0 ? (
              <div className="px-4 py-3.5">
                <EmptyState
                  icon={<Network size={18} strokeWidth={1.8} />}
                  title={t("directory.unitsEmptyTitle")}
                  body={t("directory.unitsEmptyBody")}
                />
              </div>
            ) : selectedNode ? (
              <OrganizationalUnitTree
                nodes={directory.tree}
                users={directory.users}
                selectedId={selectedNode.id}
                onSelect={(node) => setSelectedId(node.id)}
                canManage={canManage}
                onEdit={(node) => {
                  const entry = catalogActions.resolveCatalogEntry(node);
                  if (entry === null) {
                    return;
                  }
                  setFormMode("edit");
                  setEditingUnit(entry);
                  setFormOpen(true);
                }}
                onDelete={(node) => void catalogActions.handleDelete(node)}
              />
            ) : null}
            {catalogActions.catalogHint ? (
              <p className="px-4 pb-2 text-[11.5px] text-muted-foreground">
                {catalogActions.catalogHint}
              </p>
            ) : null}
            {catalogActions.actionError ? (
              <p role="alert" className={`px-4 pb-3 ${errorTextClassName}`}>
                {catalogActions.actionError}
              </p>
            ) : null}
          </Card>
          <div className="space-y-4">
            {selectedNode ? (
              <OrganizationalUnitDetailsCard
                node={selectedNode}
                memberCount={countOrganizationalUnitMembers(
                  directory.users,
                  selectedNode.id,
                )}
              />
            ) : null}
            <DirectorySyncCard
              canManage={canManage}
              onStatusLoaded={setSyncStatus}
              reloadToken={syncReloadToken}
              onSynced={async () => {
                await directory.reload();
                await catalogActions.reloadCatalog();
              }}
            />
          </div>
        </div>
      )}
      {canManage && syncStatus?.source === "ldaps" ? (
        <div className="mt-4">
          <LdapsDirectorySyncPanel
            status={syncStatus.ldaps ?? null}
            onChanged={async () => {
              setSyncReloadToken((value) => value + 1);
              await directory.reload();
              await catalogActions.reloadCatalog();
            }}
          />
        </div>
      ) : null}
      {canManage ? (
        <OrganizationalUnitFormDrawer
          open={formOpen}
          mode={formMode}
          catalog={catalogActions.catalog}
          editingUnit={editingUnit}
          onOpenChange={setFormOpen}
          onSaved={catalogActions.handleSaved}
        />
      ) : null}
    </section>
  );
}
