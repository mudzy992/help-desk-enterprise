import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export function ReportsExportButton() {
  const { t } = useTranslation();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled
      aria-disabled
      title={t("reports.exportDisabledHint")}
    >
      <Download size={14} /> {t("reports.exportAction")}
    </Button>
  );
}
