import { Network } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OrganizationalUnitTree } from "@/components/organizational-units/organizational-unit-tree";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useDirectory } from "@/lib/directory/use-directory";

export function OrganizationalUnitsPage() {
  const { t } = useTranslation();
  const directory = useDirectory();

  return (
    <section>
      <PageHeader
        crumbs={["EP-HelpDesk", t("navigation.organizationalUnits")]}
        title={t("navigation.organizationalUnits")}
        subtitle={t("directory.unitsIntro")}
      />
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
          ) : directory.tree.length === 0 ? (
            <EmptyState
              icon={<Network size={18} strokeWidth={1.8} />}
              title={t("directory.unitsEmptyTitle")}
              body={t("directory.unitsEmptyBody")}
            />
          ) : (
            <OrganizationalUnitTree
              nodes={directory.tree}
              users={directory.users}
            />
          )}
        </div>
      </Card>
    </section>
  );
}
