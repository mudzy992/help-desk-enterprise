import { CalendarDays, Grid3x3, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PriorityMatrixPanel } from "@/components/sla/priority-matrix-panel";
import { SlaCalendarsPanel } from "@/components/sla/sla-calendars-panel";
import { SlaProfileDetail } from "@/components/sla/sla-profile-detail";
import { SlaProfileList } from "@/components/sla/sla-profile-list";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { PageHeader } from "@/components/ui/page-header";
import { useSlaPageData } from "@/lib/sla/use-sla-page-data";
import { useSlaPageMutations } from "@/lib/sla/use-sla-page-mutations";
import { permissionKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";

export function SlaPage() {
  const { t } = useTranslation();
  const { hasPermission } = useSessionCapabilities();
  const canWrite = hasPermission(permissionKeys.slaWrite);
  const data = useSlaPageData();
  const mutations = useSlaPageMutations(data, canWrite);
  const [view, setView] = useState<"profiles" | "calendars" | "matrix">("profiles");
  const selectedCalendar = data.calendars.find(
    (calendar) => calendar.id === data.selected?.calendarId,
  );

  if (view === "calendars") {
    return (
      <section>
        <PageHeader
          crumbs={["EP-HelpDesk", t("navigation.sla")]}
          title={t("sla.calendarsHeading")}
          subtitle={t("sla.intro")}
          actions={
            <Button type="button" variant="outline" size="sm" onClick={() => setView("profiles")}>
              {t("sla.backToProfiles")}
            </Button>
          }
        />
        <SlaCalendarsPanel />
      </section>
    );
  }

  if (view === "matrix") {
    return (
      <section>
        <PageHeader
          crumbs={["EP-HelpDesk", t("navigation.sla")]}
          title={t("sla.priorityMatrixTitle")}
          subtitle={t("sla.priorityMatrixIntro")}
          actions={
            <Button type="button" variant="outline" size="sm" onClick={() => setView("profiles")}>
              {t("sla.backToProfiles")}
            </Button>
          }
        />
        <PriorityMatrixPanel canWrite={canWrite} />
      </section>
    );
  }

  return (
    <section>
      <PageHeader
        crumbs={["EP-HelpDesk", t("navigation.sla")]}
        title={t("sla.title")}
        subtitle={t("sla.intro")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setView("calendars")}>
              <CalendarDays size={14} />
              {t("sla.manageCalendars")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setView("matrix")}>
              <Grid3x3 size={14} />
              {t("sla.managePriorityMatrix")}
            </Button>
            {canWrite ? (
              <Button type="button" variant="primary" size="sm" onClick={() => data.startCreate()}>
                <Plus size={14} />
                {t("sla.newProfile")}
              </Button>
            ) : null}
          </div>
        }
      />
      {data.errorKey ? (
        <p role="alert" className={`mb-3 ${errorTextClassName}`}>
          {t(data.errorKey)}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_1fr]">
        <SlaProfileList
          profiles={data.profiles}
          tickets={data.tickets}
          selectedId={data.selectedId}
          isLoading={data.isLoading}
          canWrite={canWrite}
          onSelect={data.setSelectedId}
          onNew={data.startCreate}
        />
        <SlaProfileDetail
          profile={data.selected}
          calendars={data.calendars}
          calendar={selectedCalendar}
          rules={data.rules}
          changes={data.changes}
          tickets={data.tickets}
          compliance={data.compliance}
          canWrite={canWrite}
          errorKey={data.errorKey}
          isSubmitting={mutations.isSubmitting}
          onSaveProfile={mutations.saveProfile}
          onSaveRule={mutations.saveRule}
          onDeleteRule={mutations.removeRule}
          onDeleteProfile={mutations.removeProfile}
        />
      </div>
    </section>
  );
}
