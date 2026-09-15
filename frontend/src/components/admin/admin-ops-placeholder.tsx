import { Database } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/ui/empty-state";

export function AdminOpsPlaceholder() {
  const { t } = useTranslation();

  return (
    <EmptyState
      icon={<Database size={18} strokeWidth={1.8} />}
      title={t("admin.opsEmptyTitle")}
    />
  );
}
