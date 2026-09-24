import { useCallback, useEffect, useState } from "react";
import { ScrollText, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { RelativeTime } from "@/components/ui/relative-time";
import {
  errorTextClassName,
  tableHeadClassName,
  tableRowClassName,
  tableWrapClassName,
} from "@/components/ui/control";
import {
  mapAdminOpsError,
  type AdminOpsMessageKey,
} from "@/lib/admin/map-admin-ops-error";
import { readApiRequestId } from "@/lib/map-api-error";
import {
  listAuditLogs,
  type AuditLogListRow,
} from "@/services/audit-log-api";

const auditLogPageTake = 50;

interface AdminAuditLogCardProperties {
  readonly canView: boolean;
  readonly organizationalUnitId: string;
}

export function AdminAuditLogCard({
  canView,
  organizationalUnitId,
}: AdminAuditLogCardProperties) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<readonly AuditLogListRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorKey, setErrorKey] = useState<AdminOpsMessageKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canView || organizationalUnitId.length === 0) {
      setRows([]);
      setNextCursor(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorKey(null);
    setRequestId(null);
    try {
      const result = await listAuditLogs({
        organizationalUnitId,
        take: auditLogPageTake,
      });
      setRows(result.items);
      setNextCursor(result.nextCursor);
    } catch (error) {
      setRows([]);
      setNextCursor(null);
      setErrorKey(mapAdminOpsError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setIsLoading(false);
    }
  }, [canView, organizationalUnitId]);

  const loadMore = useCallback(async () => {
    if (nextCursor === null) {
      return;
    }
    setIsLoadingMore(true);
    setErrorKey(null);
    setRequestId(null);
    try {
      const result = await listAuditLogs({
        organizationalUnitId,
        take: auditLogPageTake,
        cursor: nextCursor,
      });
      setRows((current) => [...current, ...result.items]);
      setNextCursor(result.nextCursor);
    } catch (error) {
      setErrorKey(mapAdminOpsError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextCursor, organizationalUnitId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card className="fade-in">
      <CardHeader
        title={t("admin.ops.auditLogTitle")}
        subtitle={t("admin.ops.auditLogBody")}
        actions={
          <Button
            variant="ghost"
            size="icon"
            disabled={!canView || organizationalUnitId.length === 0 || isLoading}
            aria-label={t("admin.ops.auditLogRefresh")}
            title={t("admin.ops.auditLogRefresh")}
            onClick={() => void load()}
          >
            <RefreshCw className={isLoading ? "animate-spin" : undefined} />
          </Button>
        }
      />
      <div className="px-4 py-3.5">
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
        {isLoading ? (
          <PanelSkeleton className="mt-0" label={t("admin.ops.auditLogLoading")} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ScrollText size={18} strokeWidth={1.8} />}
            title={t("admin.ops.auditLogEmptyTitle")}
            body={t("admin.ops.auditLogEmptyBody")}
          />
        ) : (
          <>
            <div className={tableWrapClassName}>
              <table className="w-full min-w-[760px] text-left text-[13px]">
                <thead className={`border-b border-border/70 ${tableHeadClassName}`}>
                  <tr>
                    <th className="px-3 py-2">{t("admin.ops.auditLogColumnTime")}</th>
                    <th className="px-3 py-2">{t("admin.ops.auditLogColumnAction")}</th>
                    <th className="px-3 py-2">{t("admin.ops.auditLogColumnEntity")}</th>
                    <th className="px-3 py-2">{t("admin.ops.auditLogColumnActor")}</th>
                    <th className="px-3 py-2">{t("admin.ops.auditLogColumnRequest")}</th>
                    <th className="px-3 py-2">{t("admin.ops.auditLogColumnDetails")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className={tableRowClassName}>
                      <td className="whitespace-nowrap px-3">
                        <RelativeTime value={row.createdAt} locale={i18n.language} />
                      </td>
                      <td className="tnum px-3 text-[12px]">{row.action}</td>
                      <td className="max-w-[220px] truncate px-3 text-[12px] text-muted-foreground">
                        <span title={`${row.entityType} ${row.entityId}`}>
                          {row.entityType} · {row.entityId}
                        </span>
                      </td>
                      <td className="max-w-[160px] truncate px-3 text-[12px] text-muted-foreground">
                        {row.actorUserId ?? "—"}
                      </td>
                      <td className="max-w-[160px] truncate px-3 text-[12px] text-muted-foreground">
                        {row.requestId ?? "—"}
                      </td>
                      <td
                        className="max-w-[260px] truncate px-3 text-[12px] text-muted-foreground"
                        title={
                          row.metadata == null
                            ? undefined
                            : JSON.stringify(row.metadata)
                        }
                      >
                        {row.metadata == null
                          ? "—"
                          : JSON.stringify(row.metadata)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {nextCursor !== null ? (
              <div className="mt-3 flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isLoadingMore}
                  onClick={() => void loadMore()}
                >
                  {isLoadingMore
                    ? t("admin.ops.auditLogLoading")
                    : t("admin.ops.auditLogLoadMore")}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}
