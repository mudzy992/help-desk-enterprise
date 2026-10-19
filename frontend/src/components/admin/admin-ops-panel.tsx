import { MessageSquare } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import { AdminAuditExportCard } from "@/components/admin/admin-audit-export-card";
import { AdminAuditLogCard } from "@/components/admin/admin-audit-log-card";
import { AdminSecurityMetricsCard } from "@/components/admin/admin-security-metrics-card";
import { AdminSupportBundleCard } from "@/components/admin/admin-support-bundle-card";
import { OpsHealthCard } from "@/components/admin/ops-health-card";
import { IntegrationQueueCard } from "@/components/queue/integration-queue-card";
import { errorTextClassName, selectCompactClassName } from "@/components/ui/control";
import { mapAdminOpsError, type AdminOpsMessageKey } from "@/lib/admin/map-admin-ops-error";
import { triggerBlobDownload } from "@/lib/download/trigger-blob-download";
import { adminOpsVisibility } from "@/lib/session/admin-access";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { flattenOriginUnitOptions } from "@/lib/tickets/ticket-display";
import {
  exportAuditLog,
  verifyAuditLogChain,
  type AuditExportFormat,
  type AuditLogVerifyResult,
} from "@/services/audit-log-api";
import { listOrganizationalUnitTree } from "@/services/organizational-units-api";
import { downloadSupportBundle } from "@/services/support-bundle-api";

export function AdminOpsPanel() {
  const { t } = useTranslation();
  const capabilities = useSessionCapabilities();
  const visibility = adminOpsVisibility(capabilities);
  const [unitId, setUnitId] = useState("");
  const [unitOptions, setUnitOptions] = useState<readonly { id: string; label: string }[]>([]);
  const [unitLoadFailed, setUnitLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<AdminOpsMessageKey | null>(null);
  const [verifyResult, setVerifyResult] = useState<AuditLogVerifyResult | null>(null);
  const unitRequestSequence = useRef(0);

  const loadUnits = useCallback(async () => {
    const sequence = ++unitRequestSequence.current;
    if (!visibility.auditExport) {
      setUnitOptions([]);
      setUnitId("");
      setUnitLoadFailed(false);
      return;
    }
    setUnitLoadFailed(false);
    try {
      const options = flattenOriginUnitOptions(await listOrganizationalUnitTree());
      if (sequence !== unitRequestSequence.current) return;
      setUnitOptions(options);
      setUnitId((current) =>
        options.some((option) => option.id === current) ? current : (options[0]?.id ?? ""),
      );
    } catch {
      if (sequence !== unitRequestSequence.current) return;
      // Preserve a previously loaded scope so a retryable refresh error is non-destructive.
      setUnitLoadFailed(true);
    }
  }, [visibility.auditExport]);

  useEffect(() => {
    void loadUnits();
    return () => {
      unitRequestSequence.current += 1;
    };
  }, [loadUnits]);

  const runExport = async (format: AuditExportFormat) => {
    if (unitId.length === 0) {
      setErrorKey("admin.ops.needOrganizationalUnit");
      return;
    }
    setBusy(true);
    setErrorKey(null);
    try {
      const file = await exportAuditLog({
        organizationalUnitId: unitId,
        format,
      });
      triggerBlobDownload(file.blob, file.fileName);
    } catch (error) {
      setErrorKey(mapAdminOpsError(error));
    } finally {
      setBusy(false);
    }
  };

  const runVerify = async () => {
    setBusy(true);
    setErrorKey(null);
    setVerifyResult(null);
    try {
      setVerifyResult(await verifyAuditLogChain());
    } catch (error) {
      setErrorKey(mapAdminOpsError(error));
    } finally {
      setBusy(false);
    }
  };

  const runSupportBundle = async () => {
    setBusy(true);
    setErrorKey(null);
    try {
      const file = await downloadSupportBundle();
      triggerBlobDownload(file.blob, file.fileName);
    } catch (error) {
      setErrorKey(mapAdminOpsError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fade-in space-y-4">
      {visibility.health ? <OpsHealthCard canManage={visibility.manageAlerts} /> : null}
      {visibility.supportBundle ? <AdminSecurityMetricsCard /> : null}
      {visibility.integrationQueue ? <IntegrationQueueCard enabled /> : null}
      {visibility.teams ? (
        <Card className="fade-in">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
            <div>
              <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                <MessageSquare size={14} className="text-link" />
                {t("teamsAdmin.title")}
              </p>
              <p className="mt-1 text-[11.5px] leading-[15px] text-muted-foreground">
                {t("teamsAdmin.cardBody")}
              </p>
            </div>
            <Button asChild size="xs" variant="outline">
              <Link to="/admin/teams">{t("teamsAdmin.open")}</Link>
            </Button>
          </div>
        </Card>
      ) : null}
      {visibility.auditExport ? (
        <>
          <label className="grid max-w-md gap-1.5 text-[12.5px] font-medium text-foreground">
            {t("admin.ops.organizationalUnit")}
            <select
              className={selectCompactClassName}
              value={unitId}
              onChange={(event) => setUnitId(event.target.value)}
              aria-label={t("admin.ops.organizationalUnit")}
            >
              {unitOptions.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.label}
                </option>
              ))}
            </select>
          </label>
          {unitLoadFailed ? (
            <div role="alert" className="flex items-center gap-2 text-[12px] text-danger">
              <span>{t("admin.ops.organizationalUnitLoadError")}</span>
              <Button type="button" size="xs" variant="outline" onClick={() => void loadUnits()}>
                {t("ui.retry")}
              </Button>
            </div>
          ) : null}
          <AdminAuditLogCard canView={visibility.auditExport} organizationalUnitId={unitId} />
        </>
      ) : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <AdminAuditExportCard
          canExport={visibility.auditExport}
          isBusy={busy}
          verifyResult={verifyResult}
          onExportCsv={() => void runExport("csv")}
          onExportJson={() => void runExport("json")}
          onVerify={() => void runVerify()}
        />
        <AdminSupportBundleCard
          canGenerate={visibility.supportBundle}
          isBusy={busy}
          onGenerate={() => void runSupportBundle()}
        />
      </div>
      {errorKey ? (
        <p role="alert" className={errorTextClassName}>
          {t(errorKey)}
        </p>
      ) : null}
    </div>
  );
}
