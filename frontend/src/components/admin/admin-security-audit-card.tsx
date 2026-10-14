import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { RelativeTime } from "@/components/ui/relative-time";
import { ScrollRegion } from "@/components/ui/scroll-region";
import {
  errorTextClassName,
  tableHeadClassName,
  tableRowClassName,
  tableWrapClassName,
} from "@/components/ui/control";
import { mapAdminOpsError, type AdminOpsMessageKey } from "@/lib/admin/map-admin-ops-error";
import {
  resolveSecurityAuditViewState,
  securityActionLabelKey,
} from "@/lib/admin/admin-security-tab";
import { readApiRequestId } from "@/lib/map-api-error";
import { AuditMetadataList } from "@/components/admin/audit-metadata-list";
import {
  auditActionTranslationKey,
  auditEntityTranslationKey,
  knownAuditActions,
} from "@/lib/audit/audit-log-i18n";
import {
  listSecurityAuditLog,
  securityAuditLogPageTake,
  type SecurityAuditLogRow,
} from "@/services/security-audit-log-api";
import { listUsersSummaryPage, type UserSummary } from "@/services/users-api";

/**
 * the security journal card. It reads the SuperAdmin-only
 * `/security/audit-log` view, offers an exact `auth.*` action filter and a
 * person filter (the picker searches people and shows display names — the raw
 * user id is never the visible label), pages with `Učitaj još`, and renders
 * loading, empty, error and forbidden states distinctly. An action the UI does
 * not know yet falls back to a generic label, so an unknown historical event
 * never breaks the list.
 */

const userSearchMinimumLength = 2;
const userSearchTake = 8;

type SelectedUser = {
  readonly id: string;
  readonly label: string;
};

export function AdminSecurityAuditCard({ canView }: { readonly canView: boolean }) {
  const { t, i18n } = useTranslation();
  const [action, setAction] = useState("");
  const [userId, setUserId] = useState("");
  const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [userMatches, setUserMatches] = useState<readonly UserSummary[]>([]);
  const [rows, setRows] = useState<readonly SecurityAuditLogRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorKey, setErrorKey] = useState<AdminOpsMessageKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const searchSequence = useRef(0);
  const loadSequence = useRef(0);

  const authActions = useMemo(
    () => knownAuditActions.filter((known) => known.startsWith("auth.")),
    [],
  );

  const load = useCallback(
    async (cursor: string | null) => {
      if (!canView) {
        setRows([]);
        setNextCursor(null);
        setIsLoading(false);
        return;
      }
      const sequence = cursor === null ? ++loadSequence.current : loadSequence.current;
      if (cursor === null) setIsLoading(true);
      setErrorKey(null);
      setRequestId(null);
      try {
        const result = await listSecurityAuditLog({
          action: action.length > 0 ? action : null,
          userId: userId.length > 0 ? userId : null,
          take: securityAuditLogPageTake,
          cursor,
        });
        if (sequence !== loadSequence.current) return;
        setRows((current) => (cursor === null ? result.items : [...current, ...result.items]));
        setNextCursor(result.nextCursor);
      } catch (error) {
        if (sequence !== loadSequence.current) return;
        setRows((current) => (cursor === null ? [] : current));
        setNextCursor(null);
        setErrorKey(mapAdminOpsError(error));
        setRequestId(readApiRequestId(error));
      } finally {
        if (sequence === loadSequence.current) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [action, canView, userId],
  );

  useEffect(() => {
    void load(null);
    // `reloadToken` re-runs the same query after „Osvježi” or a filter change.
  }, [load, reloadToken]);

  useEffect(() => {
    const query = userQuery.trim();
    if (query.length < userSearchMinimumLength) {
      setUserMatches([]);
      return;
    }
    const sequence = (searchSequence.current += 1);
    const timer = setTimeout(() => {
      void listUsersSummaryPage({ take: userSearchTake, skip: 0, query })
        .then((page) => {
          if (sequence === searchSequence.current) setUserMatches(page.items);
        })
        .catch(() => {
          if (sequence === searchSequence.current) setUserMatches([]);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [userQuery]);

  const viewState = resolveSecurityAuditViewState({
    canView,
    isLoading,
    hasError: errorKey !== null,
    rowCount: rows.length,
  });

  return (
    <Card className="fade-in">
      <CardHeader
        title={t("admin.security.auditTitle")}
        subtitle={t("admin.security.auditBody")}
        actions={
          <Button
            variant="ghost"
            size="icon"
            disabled={!canView || isLoading}
            aria-label={t("admin.security.auditRefresh")}
            title={t("admin.security.auditRefresh")}
            onClick={() => setReloadToken((token) => token + 1)}
          >
            <RefreshCw className={isLoading ? "animate-spin" : undefined} />
          </Button>
        }
      />
      <div className="px-4 py-3.5">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[12px] text-muted-foreground">
            <span>{t("admin.security.filterAction")}</span>
            <select
              className="h-8 min-w-[220px] rounded-md border border-border bg-card px-2 text-[13px] text-foreground"
              value={action}
              disabled={!canView}
              aria-label={t("admin.security.filterAction")}
              onChange={(event) => {
                setAction(event.target.value);
                setRows([]);
                setNextCursor(null);
              }}
            >
              <option value="">{t("admin.security.filterActionAll")}</option>
              {authActions.map((known) => {
                const key = auditActionTranslationKey(known);
                return (
                  <option key={known} value={known}>
                    {key === null ? known : t(key as never)}
                  </option>
                );
              })}
            </select>
          </label>
          <div className="flex flex-col gap-1 text-[12px] text-muted-foreground">
            <span>{t("admin.security.filterUser")}</span>
            {selectedUser === null ? (
              <input
                className="h-8 min-w-[240px] rounded-md border border-border bg-card px-2 text-[13px] text-foreground"
                value={userQuery}
                disabled={!canView}
                placeholder={t("admin.security.filterUserPlaceholder")}
                aria-label={t("admin.security.filterUser")}
                onChange={(event) => setUserQuery(event.target.value)}
              />
            ) : (
              <span className="flex h-8 items-center gap-2 rounded-md border border-border bg-card px-2 text-[13px] text-foreground">
                <UserRound size={13} />
                <span title={selectedUser.id}>{selectedUser.label}</span>
                <button
                  type="button"
                  className="text-[12px] text-muted-foreground underline"
                  onClick={() => {
                    setSelectedUser(null);
                    setUserId("");
                    setUserQuery("");
                    setRows([]);
                  }}
                >
                  {t("admin.security.filterUserClear")}
                </button>
              </span>
            )}
            <span className="text-[11.5px]">{t("admin.security.filterUserHint")}</span>
          </div>
        </div>
        {selectedUser === null && userMatches.length > 0 ? (
          <ul className="mb-3 flex flex-col gap-1 rounded-md border border-border bg-card p-2">
            {userMatches.map((match) => (
              <li key={match.id}>
                <button
                  type="button"
                  className="w-full rounded px-1.5 py-1 text-left text-[13px] hover:bg-muted"
                  onClick={() => {
                    setSelectedUser({ id: match.id, label: match.displayName });
                    setUserId(match.id);
                    setUserMatches([]);
                    setRows([]);
                  }}
                >
                  {match.displayName}
                  <span className="ml-2 text-[11.5px] text-muted-foreground">{match.email}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {errorKey ? (
          <p className={`${errorTextClassName} mb-3`} role="alert">
            {t(errorKey)}
            {requestId ? (
              <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                {t("errors.requestId", { requestId })}
              </span>
            ) : null}
          </p>
        ) : null}
        {viewState.kind === "forbidden" ? (
          <EmptyState
            icon={<ShieldCheck size={18} strokeWidth={1.8} />}
            title={t("admin.security.forbiddenTitle")}
            body={t("admin.security.forbiddenBody")}
          />
        ) : null}
        {viewState.kind === "loading" ? (
          <PanelSkeleton className="mt-0" label={t("admin.security.auditLoading")} />
        ) : null}
        {viewState.kind === "empty" ? (
          <EmptyState
            icon={<ShieldCheck size={18} strokeWidth={1.8} />}
            title={t("admin.security.auditEmptyTitle")}
            body={t("admin.security.auditEmptyBody")}
          />
        ) : null}
        {viewState.kind === "ready" ? (
          <>
            <ScrollRegion className={tableWrapClassName}>
              <table className="w-full min-w-[720px] text-left text-[13px]">
                <thead className={`border-b border-border/70 ${tableHeadClassName}`}>
                  <tr>
                    <th className="px-3 py-2">{t("admin.security.columnTime")}</th>
                    <th className="px-3 py-2">{t("admin.security.columnAction")}</th>
                    <th className="px-3 py-2">{t("admin.security.columnTarget")}</th>
                    <th className="px-3 py-2">{t("admin.security.columnActor")}</th>
                    <th className="px-3 py-2">{t("admin.security.columnDetails")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const actionKey = auditActionTranslationKey(row.action);
                    const entityKey = auditEntityTranslationKey(row.entityType);
                    return (
                      <tr key={row.id} className={tableRowClassName}>
                        <td className="whitespace-nowrap px-3">
                          <RelativeTime value={row.createdAt} locale={i18n.language} />
                        </td>
                        <td className="px-3 text-[12px]">
                          {t(securityActionLabelKey(actionKey) as never)}
                        </td>
                        <td className="max-w-[220px] px-3 text-[12px] text-muted-foreground">
                          <span title={row.entityId}>
                            {entityKey === null
                              ? t("admin.ops.auditLog.labels.unknownEntity")
                              : t(entityKey as never)}
                          </span>
                        </td>
                        <td
                          className="max-w-[200px] truncate px-3 text-[12px] text-muted-foreground"
                          title={row.actorUserId ?? undefined}
                        >
                          {actorLabel(
                            row,
                            selectedUser,
                            t("admin.security.actorUnknown"),
                            t("admin.security.actorPseudonymous"),
                          )}
                        </td>
                        <td className="max-w-[320px] px-3 text-[12px] align-top">
                          <AuditMetadataList metadata={row.metadata} visibleCount={6} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollRegion>
            {nextCursor !== null ? (
              <div className="mt-3 flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isLoadingMore}
                  onClick={() => {
                    setIsLoadingMore(true);
                    void load(nextCursor);
                  }}
                >
                  {isLoadingMore
                    ? t("admin.security.auditLoading")
                    : t("admin.security.auditLoadMore")}
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * The actor is shown as the picked person's display name when that person is
 * the one being filtered on; otherwise the pseudonymous identifier is kept as
 * a `title` on a generic label — never as the visible text.
 */
function actorLabel(
  row: SecurityAuditLogRow,
  selectedUser: SelectedUser | null,
  unknownLabel: string,
  pseudonymousLabel: string,
): string {
  if (row.actorUserId === null) return unknownLabel;
  if (selectedUser !== null && row.actorUserId === selectedUser.id) {
    return selectedUser.label;
  }
  // The identifier stays a tooltip; the visible text stays the designed label
  // (**Pseudonim** / **Sistem** / the picked person). The shared list endpoint
  // also sends a resolved display name, but the journal deliberately does not
  // print it — this surface is documented as pseudonymous.
  return pseudonymousLabel;
}
