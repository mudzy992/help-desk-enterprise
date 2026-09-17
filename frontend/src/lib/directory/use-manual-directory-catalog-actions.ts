import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { syncManualDirectoryCatalog } from "@/lib/directory/sync-manual-directory-catalog";
import { ApiError } from "@/services/api";
import {
  deleteManualDirectoryOrganizationalUnit,
  listManualDirectoryOrganizationalUnits,
  type ManualDirectoryOrganizationalUnit,
} from "@/services/directory-sync-api";
import type { OrganizationalUnitTreeNode } from "@/services/organizational-units-api";

function mapCatalogSaveError(
  error: unknown,
  blocked: string,
  failed: string,
  circular: string,
): string {
  if (!(error instanceof ApiError)) {
    return failed;
  }
  if (error.code === "HAS_CHILDREN" || error.code === "HAS_MAPPED_USERS") {
    return blocked;
  }
  if (error.code === "CIRCULAR_REFERENCE") {
    return circular;
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

  const resolveCatalogEntry = (node: OrganizationalUnitTreeNode) => {
    const entry = findCatalogEntry(node);
    if (entry === undefined) {
      setActionError(t("directory.ouNotInCatalog"));
      return null;
    }
    setActionError(null);
    return entry;
  };

  const handleDelete = async (node: OrganizationalUnitTreeNode) => {
    const entry = resolveCatalogEntry(node);
    if (entry === null) {
      return;
    }
    try {
      await deleteManualDirectoryOrganizationalUnit(entry.externalId);
      await reloadCatalog();
    } catch (error) {
      setActionError(
        mapCatalogSaveError(
          error,
          t("directory.ouDeleteBlocked"),
          t("directory.catalogSaveFailed"),
          t("directory.ouCircularReference"),
        ),
      );
    }
  };

  const handleSaved = async (unit: ManualDirectoryOrganizationalUnit) => {
    setCatalogHint(t("directory.catalogPendingSync"));
    try {
      await materializeCatalogUnit(unit);
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
    resolveCatalogEntry,
    handleDelete,
    handleSaved,
  };
}
