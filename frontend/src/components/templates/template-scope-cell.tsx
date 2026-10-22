import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

export function TemplateScopeCell({
  serviceIds,
  categoryIds,
  groupIds = [],
}: {
  readonly serviceIds: readonly string[];
  readonly categoryIds: readonly string[];
  readonly groupIds?: readonly string[];
}) {
  const { t } = useTranslation();
  if (serviceIds.length + categoryIds.length + groupIds.length === 0) {
    return <Badge tone="info">{t("templates.list.global")}</Badge>;
  }
  return (
    <span className="text-[11.5px] text-muted-foreground">
      {t("templates.list.scopeSummary", {
        services: serviceIds.length,
        categories: categoryIds.length,
        groups: groupIds.length,
      })}
    </span>
  );
}
