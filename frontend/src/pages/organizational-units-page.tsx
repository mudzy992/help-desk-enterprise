import { Network } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { OrganizationalUnitDetailsCard } from "@/components/organizational-units/organizational-unit-details-card";
import { OrganizationalUnitTree } from "@/components/organizational-units/organizational-unit-tree";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { countOrganizationalUnitMembers } from "@/lib/directory/count-organizational-unit-members";
import { findOrganizationalUnitNode } from "@/lib/directory/find-organizational-unit-node";
import { useDirectory } from "@/lib/directory/use-directory";

interface OrganizationalUnitsPageProperties {
  readonly embedded?: boolean;
}

export function OrganizationalUnitsPage({
  embedded = false,
}: OrganizationalUnitsPageProperties) {
  const { t } = useTranslation();
  const directory = useDirectory();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedNode =
    findOrganizationalUnitNode(directory.tree, selectedId) ??
    directory.tree[0] ??
    null;

  return (
    <section>
      {embedded ? null : (
        <PageHeader
          crumbs={["EP-HelpDesk", t("navigation.organizationalUnits")]}
          title={t("navigation.organizationalUnits")}
          subtitle={t("directory.unitsIntro")}
        />
      )}
      {directory.isLoading ||
      directory.errorKey ||
      directory.tree.length === 0 ||
      selectedNode === null ? (
        <Card>
          <CardHeader
            title={t("directory.unitsHeading")}
            subtitle={t("directory.unitsHint")}
          />
          <div className="px-4 py-3.5">
            {directory.isLoading ? (
              <PanelSkeleton className="mt-0" label={t("directory.unitsHeading")} />
            ) : directory.errorKey ? (
              <ApiErrorText
                messageKey={directory.errorKey}
                requestId={directory.requestId}
              />
            ) : (
              <EmptyState
                icon={<Network size={18} strokeWidth={1.8} />}
                title={t("directory.unitsEmptyTitle")}
                body={t("directory.unitsEmptyBody")}
              />
            )}
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
          <Card>
            <CardHeader
              title={t("directory.unitsHeading")}
              subtitle={t("directory.unitsHint")}
            />
            <OrganizationalUnitTree
              nodes={directory.tree}
              users={directory.users}
              selectedId={selectedNode.id}
              onSelect={(node) => setSelectedId(node.id)}
            />
          </Card>
          <OrganizationalUnitDetailsCard
            node={selectedNode}
            memberCount={countOrganizationalUnitMembers(
              directory.users,
              selectedNode.id,
            )}
          />
        </div>
      )}
    </section>
  );
}
