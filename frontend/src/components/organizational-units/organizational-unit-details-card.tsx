import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import type { OrganizationalUnitTreeNode } from "@/services/organizational-units-api";

interface OrganizationalUnitDetailsCardProperties {
  readonly node: OrganizationalUnitTreeNode;
  readonly memberCount: number;
}

export function OrganizationalUnitDetailsCard({
  node,
  memberCount,
}: OrganizationalUnitDetailsCardProperties) {
  const { t } = useTranslation();
  const distinguishedName =
    node.distinguishedName?.trim() || t("directory.detailsEmpty");

  return (
    <Card>
      <CardHeader
        title={t("directory.detailsTitle", { name: node.name })}
        subtitle={node.ouPath}
      />
      <dl className="space-y-3 px-4 py-4 text-[12px]">
        <div>
          <dt className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/60">
            {t("directory.detailsNameLabel")}
          </dt>
          <dd className="mt-0.5 text-foreground/90">{node.name}</dd>
        </div>
        <div>
          <dt className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/60">
            {t("directory.detailsPathLabel")}
          </dt>
          <dd className="tnum mt-0.5 font-mono text-[11px] text-foreground/90">
            {node.ouPath}
          </dd>
        </div>
        <div>
          <dt className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/60">
            {t("directory.detailsDnLabel")}
          </dt>
          <dd className="tnum mt-0.5 break-all font-mono text-[10.5px] leading-4.5 text-muted-foreground">
            {distinguishedName}
          </dd>
        </div>
        <div className="flex gap-1.5 border-t border-border/60 pt-3">
          <Badge tone="primary" dot={false}>
            {t("directory.detailsMapped", { count: memberCount })}
          </Badge>
        </div>
      </dl>
    </Card>
  );
}
