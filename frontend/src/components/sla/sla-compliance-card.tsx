import { useTranslation } from "react-i18next";
import { HBars } from "@/components/charts/h-bars";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SEMANTIC_DOT_HEX } from "@/lib/theme/semantic-meta";
import type { SlaComplianceResponse } from "@/services/sla-types";

interface SlaComplianceCardProperties {
  readonly compliance: SlaComplianceResponse | null;
  readonly slaProfileId: string;
}

export function SlaComplianceCard({
  compliance,
  slaProfileId,
}: SlaComplianceCardProperties) {
  const { t } = useTranslation();
  const row = compliance?.profiles.find(
    (profile) => profile.slaProfileId === slaProfileId,
  );

  const items = [
    row?.responseCompliancePercent == null
      ? null
      : {
          label: t("sla.complianceResponse"),
          value: row.responseCompliancePercent,
          color: SEMANTIC_DOT_HEX.success,
          suffix: "%",
        },
    row?.resolutionCompliancePercent == null
      ? null
      : {
          label: t("sla.complianceResolution"),
          value: row.resolutionCompliancePercent,
          color: SEMANTIC_DOT_HEX.primary,
          suffix: "%",
        },
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <Card>
      <CardHeader
        title={t("sla.complianceTitle")}
        subtitle={t("sla.complianceHint")}
      />
      <div className="px-4 py-4">
        {items.length === 0 ? (
          <EmptyState
            title={t("sla.complianceEmptyTitle")}
            body={t("sla.complianceEmptyBody")}
          />
        ) : (
          <HBars items={items} />
        )}
      </div>
    </Card>
  );
}
