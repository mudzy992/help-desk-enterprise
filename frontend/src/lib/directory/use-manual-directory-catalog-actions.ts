import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { matchCatalogEntry } from "@/lib/directory/match-catalog-entry";
import { syncManualDirectoryCatalog } from "@/lib/directory/sync-manual-directory-catalog";
import { ApiError } from "@/services/api";
import {
  deleteManualDirectoryOrganizationalUnit,
  listManualDirectoryOrganizationalUnits,
  type CreateOrganizationalUnitFromTreeResponse,
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

/**
 * an OU error belongs to the row that raised it, not to the
 * bottom of the card. The state keeps the unit id next to the message so the
 * tree can render it as `role="alert"` under that very row.
 */
export type CatalogActionError = {
  readonly organizationalUnitId: string;
  readonly message: string;
};

export function useManualDirectoryCatalogActions(input: {
  readonly canManage: boolean;
  readonly reloadDirectory: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<readonly ManualDirectoryOrganizationalUnit[]>([]);
  const [actionError, setActionError] = useState<CatalogActionError | null>(null);
  const [catalogHint, setCatalogHint] = useState<string | null>(null);
  /**
   * W2.36c: a message that is not tied to a tree row. The old create flow attached
   * its failure to `unit.externalId`, but the tree renders by OU id — so a failed
   * materialization produced **no** message at all and the pending hint stayed.
   */
  const [catalogError, setCatalogError] = useState<string | null>(null);
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

  /**
   * No request is made when the row cannot be aligned with the catalog: the
   * answer is known locally, so the screen explains it immediately.
   */
  const resolveCatalogEntry = (node: OrganizationalUnitTreeNode) => {
    const match = matchCatalogEntry(catalog, node);
    if (match.kind === "missing") {
      setActionError({
        organizationalUnitId: node.id,
        message: t("directory.ouNotInCatalog"),
      });
      return null;
    }
    if (match.kind === "path-mismatch") {
      setActionError({
        organizationalUnitId: node.id,
        message: t("directory.ouPathMismatch", {
          catalogPath: match.entry.organizationalUnitPath,
          treePath: match.treePath,
        }),
      });
      return null;
    }
    setActionError(null);
    return match.entry;
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
      setActionError({
        organizationalUnitId: node.id,
        message: mapCatalogSaveError(
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
      });
    }
  };

  const handleSaved = async (unit: ManualDirectoryOrganizationalUnit) => {
    setCatalogHint(t("directory.catalogPendingSync"));
    setCatalogError(null);
    try {
      await materializeCatalogUnit(unit);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : t("directory.syncFailed");
      // Both places: under the row when it has one, and above the tree so the
      // failure is visible even when the row was never materialized.
      setActionError({ organizationalUnitId: unit.externalId, message });
      setCatalogError(message);
      setCatalogHint(null);
      await reloadCatalog();
    }
  };

  /**
   * W2.36c: the create form posts name + tree parent; the server writes both rows
   * in one transaction. Nothing is "pending" here, so the hint states the result
   * and a failed refresh must not be reported as a failed create.
   */
  const handleCreated = async (created: CreateOrganizationalUnitFromTreeResponse) => {
    setActionError(null);
    setCatalogError(null);
    setCatalogHint(null);
    try {
      await input.reloadDirectory();
    } catch {
      setCatalogError(t("directory.ouCreatedRefreshFailed"));
      await reloadCatalog();
      return;
    }
    await reloadCatalog();
    setCatalogHint(t("directory.ouCreatedHint", { path: created.organizationalUnit.ouPath }));
  };

  return {
    catalog,
    actionError,
    clearActionError: () => setActionError(null),
    isPathAligned: (node: OrganizationalUnitTreeNode) =>
      matchCatalogEntry(catalog, node).kind === "matched",
    catalogHint,
    catalogError,
    reloadCatalog,
    handleCreated,
    resolveCatalogEntry,
    handleDelete,
    handleSaved,
  };
}
