import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export function TicketCsvExportAction({
  canExport,
  isExporting,
  onExport,
}: {
  readonly canExport: boolean;
  readonly isExporting: boolean;
  readonly onExport: () => void;
}) {
  const { t } = useTranslation();
  if (!canExport) return null;
  return (
    <Button type="button" size="sm" variant="outline" disabled={isExporting} onClick={onExport}>
      <Download size={14} /> {isExporting ? t("tickets.exportRunning") : t("tickets.exportCsv")}
    </Button>
  );
}

export function TicketCsvExportAuditHint({ canExport }: { readonly canExport: boolean }) {
  const { t } = useTranslation();
  if (!canExport) return null;
  return (
    <p className="mt-1 text-[11.5px] text-muted-foreground" data-testid="ticket-export-audit-hint">
      {t("tickets.exportAuditedHint")}
    </p>
  );
}
