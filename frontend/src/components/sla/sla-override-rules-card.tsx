import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SlaRulesTable } from "@/components/sla/sla-rules-table";
import type { SlaRule } from "@/services/sla-api";

interface SlaOverrideRulesCardProperties {
  readonly rules: readonly SlaRule[];
  readonly canWrite: boolean;
  readonly onEdit: () => void;
}

export function SlaOverrideRulesCard({
  rules,
  canWrite,
  onEdit,
}: SlaOverrideRulesCardProperties) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader
        title={t("sla.overrideRulesHeading")}
        subtitle={t("sla.overrideRulesHint")}
        actions={
          canWrite ? (
            <Button type="button" variant="outline" size="xs" onClick={onEdit}>
              {t("sla.edit")}
            </Button>
          ) : null
        }
      />
      <div className="px-4 py-3.5">
        {rules.length > 0 ? (
          <SlaRulesTable rules={rules} readOnly />
        ) : (
          <EmptyState
            title={t("sla.overrideRulesEmptyTitle")}
            body={t("sla.overrideRulesEmptyBody")}
          />
        )}
      </div>
    </Card>
  );
}
