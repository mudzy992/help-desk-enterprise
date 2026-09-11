import { Network } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export function OrganizationalUnitsPage() {
  const { t } = useTranslation();
  return (
    <section>
      <PageHeader
        crumbs={["EP-HelpDesk", t("navigation.organizationalUnits")]}
        title={t("navigation.organizationalUnits")}
      />
      <EmptyState
        icon={<Network size={18} strokeWidth={1.8} />}
        title={t("placeholders.organizationalUnitsTitle")}
        body={t("placeholders.organizationalUnitsBody")}
      />
    </section>
  );
}
