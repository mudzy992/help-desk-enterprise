import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { syncManualDirectoryCatalog } from "@/lib/directory/sync-manual-directory-catalog";
import { ApiError } from "@/services/api";
import {
  deleteManualDirectoryOrganizationalUnit,
  listManualDirectoryOrganizationalUnits,
  updateManualDirectoryOrganizationalUnit,
  type ManualDirectoryOrganizationalUnit,
} from "@/services/directory-sync-api";
import type { OrganizationalUnitTreeNode } from "@/services/organizational-units-api";

function mapCatalogSaveError(error: unknown, blocked: string, failed: string): string {
  if (
    error instanceof ApiError &&
    (error.code === "HAS_CHILDREN" || error.code === "HAS_MAPPED_USERS")
  ) {
    return blocked;
  }
  return failed;
}

export function useManualDirectoryCatalogActions(input: {
  readonly canManage: boolean;
  readonly reloadDirectory: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<readonly ManualDirectoryOrganizationalUnit[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [catalogHint, setCatalogHint] = useState<string | null>(null);

  const reloadCatalog = useCallback(async () => {
    if (!input.canManage) {
      return;
    }
    try {
      setCatalog(await listManualDirectoryOrganizationalUnits());
    } catch {
      setCatalog([]);
    }
  }, [input.canManage]);

  useEffect(() => {
    void reloadCatalog();
  }, [reloadCatalog]);

  const findCatalogEntry = (node: OrganizationalUnitTreeNode) =>
    catalog.find(
      (entry) =>
        entry.organizationalUnitPath === node.ouPath ||
        entry.distinguishedName === node.distinguishedName,
    );

  const materializeCatalogUnit = async (
    unit: Pick<
      ManualDirectoryOrganizationalUnit,
      "distinguishedName" | "organizationalUnitPath" | "parentExternalId"
    >,
  ) => {
    await syncManualDirectoryCatalog({ focus: unit });
    await input.reloadDirectory();
    await reloadCatalog();
    setCatalogHint(t("directory.catalogSynced"));
  };

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
      const updated = await updateManualDirectoryOrganizationalUnit(entry.externalId, {
        displayName: nextName.trim(),
      });
      await materializeCatalogUnit(updated);
    } catch (error) {
      setActionError(
        mapCatalogSaveError(
          error,
          t("directory.ouDeleteBlocked"),
          t("directory.catalogSaveFailed"),
        ),
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
        mapCatalogSaveError(
          error,
          t("directory.ouDeleteBlocked"),
          t("directory.catalogSaveFailed"),
        ),
      );
    }
  };

  const handleCreated = async (created: ManualDirectoryOrganizationalUnit) => {
    setCatalogHint(t("directory.catalogPendingSync"));
    try {
      await materializeCatalogUnit(created);
    } catch (error) {
      setActionError(
        error instanceof ApiError ? error.message : t("directory.syncFailed"),
      );
      await reloadCatalog();
    }
  };

  return {
    catalog,
    actionError,
    catalogHint,
    reloadCatalog,
    handleEdit,
    handleDelete,
    handleCreated,
  };
}
