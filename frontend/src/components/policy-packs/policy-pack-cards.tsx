import { Package } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { countPolicyPackPermissions } from "@/lib/policy-packs/count-policy-pack-permissions";
import type { PolicyPackSummary } from "@/services/policy-packs-api";

interface PolicyPackCardsProperties {
  readonly packs: readonly PolicyPackSummary[];
}

export function PolicyPackCards({ packs }: PolicyPackCardsProperties) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {packs.map((pack) => (
        <Card
          key={pack.key}
          className="transition-colors hover:border-[#31405C]"
        >
          <div className="flex items-start gap-3 px-4 py-3.5">
            <span className="flex size-9 items-center justify-center rounded-md border border-border bg-elevated text-muted-foreground">
              <Package size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                {t("policyPacks.cardTitle", { code: pack.key })}
              </p>
              <p className="mt-0.5 text-[11.5px] leading-4.5 text-muted-foreground">
                {pack.description}
              </p>
              <p className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground/80">
                <span className="tnum">
                  {t("policyPacks.permissionCount", {
                    count: countPolicyPackPermissions(pack.grants),
                  })}
                </span>
                <span>·</span>
                <span className="tnum">{t("policyPacks.assignmentUnknown")}</span>
              </p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
