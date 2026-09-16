import { Network, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AddOrganizationalUnitForm } from "@/components/organizational-units/add-organizational-unit-form";
import { DirectorySyncCard } from "@/components/organizational-units/directory-sync-card";
import { OrganizationalUnitDetailsCard } from "@/components/organizational-units/organizational-unit-details-card";
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
import { roleKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { ApiError } from "@/services/api";
import {
  deleteManualDirectoryOrganizationalUnit,
  listManualDirectoryOrganizationalUnits,
  updateManualDirectoryOrganizationalUnit,
  type ManualDirectoryOrganizationalUnit,
} from "@/services/directory-sync-api";
import type { OrganizationalUnitTreeNode } from "@/services/organizational-units-api";

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
  const [showAddForm, setShowAddForm] = useState(false);
  const [catalog, setCatalog] = useState<readonly ManualDirectoryOrganizationalUnit[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const selectedNode =
    findOrganizationalUnitNode(directory.tree, selectedId) ??
    directory.tree[0] ??
    null;

  const reloadCatalog = useCallback(async () => {
    if (!canManage) {
      return;
    }
    try {
      setCatalog(await listManualDirectoryOrganizationalUnits());
    } catch {
      setCatalog([]);
    }
  }, [canManage]);

  useEffect(() => {
    void reloadCatalog();
  }, [reloadCatalog]);

  const findCatalogEntry = (node: OrganizationalUnitTreeNode) =>
    catalog.find(
      (entry) =>
        entry.organizationalUnitPath === node.ouPath ||
        entry.distinguishedName === node.distinguishedName,
    );

  const handleEdit = async (node: OrganizationalUnitTreeNode) => {
    const entry = findCatalogEntry(node);
    if (entry === undefined) {
      setActionError(t("directory.ouNotInCatalog"));
      return;
    }
    const nextName = window.prompt(t("directory.ouNamePlaceholder"), entry.displayName);
    if (nextName === null || nextName.trim().length === 0) {
      return;
    }
    setActionError(null);
    try {
      await updateManualDirectoryOrganizationalUnit(entry.externalId, {
        displayName: nextName.trim(),
      });
      await reloadCatalog();
    } catch (error) {
      setActionError(
        error instanceof ApiError
          ? error.code === "HAS_CHILDREN" || error.code === "HAS_MAPPED_USERS"
            ? t("directory.ouDeleteBlocked")
            : t("directory.catalogSaveFailed")
          : t("directory.catalogSaveFailed"),
      );
    }
  };

  const handleDelete = async (node: OrganizationalUnitTreeNode) => {
    const entry = findCatalogEntry(node);
    if (entry === undefined) {
      setActionError(t("directory.ouNotInCatalog"));
      return;
    }
    setActionError(null);
    try {
      await deleteManualDirectoryOrganizationalUnit(entry.externalId);
      await reloadCatalog();
    } catch (error) {
      setActionError(
        error instanceof ApiError
          ? error.code === "HAS_CHILDREN" || error.code === "HAS_MAPPED_USERS"
            ? t("directory.ouDeleteBlocked")
            : t("directory.catalogSaveFailed")
          : t("directory.catalogSaveFailed"),
      );
    }
  };

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
                  <Button variant="outline" size="xs" onClick={() => setShowAddForm(true)}>
                    <Plus size={12} /> {t("directory.ouAdd")}
                  </Button>
                ) : null
              }
            />
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
                onEdit={(node) => void handleEdit(node)}
                onDelete={(node) => void handleDelete(node)}
              />
            ) : null}
            {showAddForm && canManage ? (
              <AddOrganizationalUnitForm
                catalog={catalog}
                onCancel={() => setShowAddForm(false)}
                onCreated={async () => {
                  setShowAddForm(false);
                  await reloadCatalog();
                }}
              />
            ) : null}
            {actionError ? (
              <p role="alert" className={`px-4 pb-3 ${errorTextClassName}`}>
                {actionError}
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
              onSynced={async () => {
                await directory.reload();
                await reloadCatalog();
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
