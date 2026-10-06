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

const blockerErrorCodes = new Set([
  "HAS_CHILDREN",
  "HAS_MAPPED_USERS",
  "HAS_GROUPS",
  "HAS_ASSETS",
  "HAS_CHANGE_REQUESTS",
  "HAS_KNOWLEDGE_ARTICLES",
  "HAS_PROBLEMS",
  "HAS_ROUTING_RULES",
  "HAS_SLA_RULES",
  "HAS_REPORT_SCHEDULES",
  "HAS_TICKETS",
  "RESOURCE_IN_USE",
]);

type ApiBlocker = { readonly kind: string; readonly count: number };

function readBlockers(value: unknown): readonly ApiBlocker[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is ApiBlocker =>
      typeof item === "object" &&
      item !== null &&
      "kind" in item &&
      typeof item.kind === "string" &&
      "count" in item &&
      typeof item.count === "number",
  );
}

function mapCatalogSaveError(
  error: unknown,
  blocked: string,
  failed: string,
  circular: string,
  describeBlockers: (error: ApiError) => string,
): string {
  if (!(error instanceof ApiError)) {
    return failed;
  }
  if (error.code === "CIRCULAR_REFERENCE") {
    return circular;
  }
  if (blockerErrorCodes.has(error.code)) {
    return describeBlockers(error) || blocked;
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
  const blockerLabels: Record<string, string> = {
    children: t("directory.ouBlockerKinds.children"),
    mappedUsers: t("directory.ouBlockerKinds.mappedUsers"),
    groups: t("directory.ouBlockerKinds.groups"),
    assets: t("directory.ouBlockerKinds.assets"),
    assetContracts: t("directory.ouBlockerKinds.assetContracts"),
    softwareLicenses: t("directory.ouBlockerKinds.softwareLicenses"),
    assetSignatories: t("directory.ouBlockerKinds.assetSignatories"),
    changeRequests: t("directory.ouBlockerKinds.changeRequests"),
    knowledgeArticles: t("directory.ouBlockerKinds.knowledgeArticles"),
    knowledgeInterceptResolutions: t("directory.ouBlockerKinds.knowledgeInterceptResolutions"),
    problems: t("directory.ouBlockerKinds.problems"),
    routingRules: t("directory.ouBlockerKinds.routingRules"),
    slaRules: t("directory.ouBlockerKinds.slaRules"),
    reportSchedules: t("directory.ouBlockerKinds.reportSchedules"),
    tickets: t("directory.ouBlockerKinds.tickets"),
    directoryChildren: t("directory.ouBlockerKinds.directoryChildren"),
    directoryUsers: t("directory.ouBlockerKinds.directoryUsers"),
    directoryGroups: t("directory.ouBlockerKinds.directoryGroups"),
  };

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
      const result = await deleteManualDirectoryOrganizationalUnit(entry.externalId);
      const removedRoleAssignments = result.warnings.find(
        (warning) => warning.code === "ROLE_ASSIGNMENTS_REMOVED",
      )?.count;
      setActionError(null);
      setCatalogHint(
        removedRoleAssignments === undefined
          ? t("directory.ouDeleteSucceeded")
          : t("directory.ouDeleteRoleAssignmentsWarning", {
              count: removedRoleAssignments,
            }),
      );
      try {
        await input.reloadDirectory();
      } catch {
        // The delete is already committed; a read failure must not report it as a failed delete.
      }
      await reloadCatalog();
    } catch (error) {
      setActionError(
        mapCatalogSaveError(
          error,
          t("directory.ouDeleteBlocked"),
          t("directory.catalogSaveFailed"),
          t("directory.ouCircularReference"),
          (apiError) => {
            const blockers = readBlockers(apiError.details?.blockers);
            if (blockers.length === 0) {
              return t("directory.ouDeleteBlocked");
            }
            const details = blockers
              .map(({ kind, count }) => `${blockerLabels[kind] ?? kind}: ${count}`)
              .join(", ");
            return `${t("directory.ouDeleteBlocked")}: ${details}`;
          },
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
