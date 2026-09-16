import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminAuditExportCard } from "@/components/admin/admin-audit-export-card";
import { AdminSupportBundleCard } from "@/components/admin/admin-support-bundle-card";
import { errorTextClassName, selectCompactClassName } from "@/components/ui/control";
import { mapAdminOpsError, type AdminOpsMessageKey } from "@/lib/admin/map-admin-ops-error";
import { triggerBlobDownload } from "@/lib/download/trigger-blob-download";
import { permissionKeys, roleKeys } from "@/lib/session/permission-keys";
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
  const { session, hasRole, hasPermission } = useSessionCapabilities();
  const canExportAudit =
    session?.isSuperAdmin === true ||
    hasPermission(permissionKeys.auditExport);
  const canSupportBundle =
    session?.isSuperAdmin === true || hasRole(roleKeys.superAdmin);
  const [unitId, setUnitId] = useState("");
  const [unitOptions, setUnitOptions] = useState<
    readonly { id: string; label: string }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<AdminOpsMessageKey | null>(null);
  const [verifyResult, setVerifyResult] = useState<AuditLogVerifyResult | null>(
    null,
  );

  useEffect(() => {
    void listOrganizationalUnitTree()
      .then((tree) => {
        const options = flattenOriginUnitOptions(tree);
        setUnitOptions(options);
        setUnitId((current) => current || options[0]?.id || "");
      })
      .catch(() => setUnitOptions([]));
  }, []);

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
    <div className="space-y-4">
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <AdminAuditExportCard
          canExport={canExportAudit}
          isBusy={busy}
          verifyResult={verifyResult}
          onExportCsv={() => void runExport("csv")}
          onExportJson={() => void runExport("json")}
          onVerify={() => void runVerify()}
        />
        <AdminSupportBundleCard
          canGenerate={canSupportBundle}
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
