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
      {packs.map((pack) => {
        const name = t(`policyPacks.packs.${pack.key}.name`, {
          defaultValue: pack.name,
        });
        const description = t(`policyPacks.packs.${pack.key}.description`, {
          defaultValue: pack.description,
        });
        return (
          <Card
            key={pack.key}
            className="transition-colors hover:border-[#31405C]"
          >
            <div className="flex items-start gap-3 px-4 py-3.5">
              <span className="flex size-9 items-center justify-center rounded-md border border-border bg-elevated text-muted-foreground">
                <Package size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-foreground">
                  {name}
                </p>
                <p className="mt-0.5 text-[11.5px] leading-4.5 text-muted-foreground">
                  {description}
                </p>
                <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground/80">
                  {pack.grants.map((grant) => (
                    <li key={`${pack.key}-${grant.roleKey}`}>
                      {t("policyPacks.grantRoleLine", {
                        role: t(`policyPacks.roles.${grant.roleKey}`, {
                          defaultValue: grant.roleKey,
                        }),
                        count: grant.permissionKeys.length,
                      })}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[11px] text-muted-foreground/70">
                  {t("policyPacks.permissionCount", {
                    count: countPolicyPackPermissions(pack.grants),
                  })}
                </p>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
