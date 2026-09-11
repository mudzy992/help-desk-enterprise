import { Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export function SettingsPage() {
  const { t } = useTranslation();
  return (
    <section>
      <PageHeader
        crumbs={["EP-HelpDesk", t("navigation.settings")]}
        title={t("navigation.settings")}
      />
      <EmptyState
        icon={<Settings size={18} strokeWidth={1.8} />}
        title={t("placeholders.settingsTitle")}
        body={t("placeholders.settingsBody")}
      />
    </section>
  );
}
