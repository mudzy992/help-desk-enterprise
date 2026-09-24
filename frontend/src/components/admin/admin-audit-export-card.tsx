import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { errorTextClassName } from "@/components/ui/control";
import { describeVerifyResult } from "@/lib/admin/map-admin-ops-error";
import type { AuditLogVerifyResult } from "@/services/audit-log-api";

interface AdminAuditExportCardProperties {
  readonly canExport: boolean;
  readonly isBusy: boolean;
  readonly verifyResult: AuditLogVerifyResult | null;
  readonly onExportCsv: () => void;
  readonly onExportJson: () => void;
  readonly onVerify: () => void;
}

export function AdminAuditExportCard({
  canExport,
  isBusy,
  verifyResult,
  onExportCsv,
  onExportJson,
  onVerify,
}: AdminAuditExportCardProperties) {
  const { t } = useTranslation();
  const verify =
    verifyResult === null ? null : describeVerifyResult(verifyResult);
  return (
    <Card className="fade-in">
      <div className="px-4 py-4">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <Download size={14} className="text-link" />
          {t("admin.ops.auditTitle")}
        </p>
        <p className="mt-1.5 text-[11.5px] leading-[15px] text-muted-foreground">
          {t("admin.ops.auditBody")}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button
            variant="outline"
            size="xs"
            disabled={!canExport || isBusy}
            onClick={onExportCsv}
          >
            CSV
          </Button>
          <Button
            variant="outline"
            size="xs"
            disabled={!canExport || isBusy}
            onClick={onExportJson}
          >
            JSON
          </Button>
          <Button
            variant="outline"
            size="xs"
            disabled={!canExport || isBusy}
            onClick={onVerify}
          >
            {t("admin.ops.verify")}
          </Button>
        </div>
        {verify ? (
          <p
            className={
              verify.tone === "success"
                ? "mt-2 text-[11.5px] text-ok"
                : verify.tone === "danger"
                  ? `mt-2 ${errorTextClassName}`
                  : "mt-2 text-[11.5px] text-muted-foreground"
            }
          >
            {t(verify.key, verify.values)}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
