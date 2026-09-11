import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SlaCalendarsPanel } from "@/components/sla/sla-calendars-panel";
import { SlaProfilesPanel } from "@/components/sla/sla-profiles-panel";
import { PageHeader } from "@/components/ui/page-header";
import { UnderlineTabs } from "@/components/ui/tabs";

export function SlaPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("profiles");

  return (
    <section>
      <PageHeader
        crumbs={["EP-HelpDesk", t("navigation.sla")]}
        title={t("sla.title")}
        subtitle={t("sla.intro")}
      />
      <UnderlineTabs
        className="mb-4"
        active={tab}
        onChange={setTab}
        items={[
          { key: "profiles", label: t("sla.profilesTab") },
          { key: "calendars", label: t("sla.calendarsTab") },
        ]}
      />
      {tab === "calendars" ? <SlaCalendarsPanel /> : <SlaProfilesPanel />}
    </section>
  );
}
