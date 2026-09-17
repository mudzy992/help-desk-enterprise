import { CalendarDays, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SlaCalendarsPanel } from "@/components/sla/sla-calendars-panel";
import { SlaProfileDetail } from "@/components/sla/sla-profile-detail";
import { SlaProfileList } from "@/components/sla/sla-profile-list";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { PageHeader } from "@/components/ui/page-header";
import { mapSlaError } from "@/lib/sla/map-sla-error";
import { useSlaPageData } from "@/lib/sla/use-sla-page-data";
import { permissionKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import {
  createSlaProfile,
  createSlaRule,
  deleteSlaProfile,
  deleteSlaRule,
  updateSlaProfile,
  updateSlaRule,
  type ProfileWriteInput,
  type RuleWriteInput,
  type SlaRule,
} from "@/services/sla-api";

export function SlaPage() {
  const { t } = useTranslation();
  const { hasPermission } = useSessionCapabilities();
  const canWrite = hasPermission(permissionKeys.slaWrite);
  const data = useSlaPageData();
  const [view, setView] = useState<"profiles" | "calendars">("profiles");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedCalendar = data.calendars.find(
    (calendar) => calendar.id === data.selected?.calendarId,
  );

  const saveProfile = async (
    input: ProfileWriteInput & { readonly key: string },
  ) => {
    if (!canWrite) return;
    setIsSubmitting(true);
    data.setErrorKey(null);
    try {
      if (data.selected === undefined) {
        const created = await createSlaProfile(input);
        data.setSelectedId(created.id);
      } else {
        await updateSlaProfile(data.selected.id, input);
      }
      await data.load();
    } catch (error) {
      data.setErrorKey(mapSlaError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveRule = async (input: RuleWriteInput, editing?: SlaRule) => {
    if (!canWrite || data.selected === undefined) return;
    setIsSubmitting(true);
    data.setErrorKey(null);
    try {
      if (editing === undefined) {
        await createSlaRule({ ...input, slaProfileId: data.selected.id });
      } else {
        await updateSlaRule(editing.id, input);
      }
      await data.load();
    } catch (error) {
      data.setErrorKey(mapSlaError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const removeRule = async (rule: SlaRule, reason: string) => {
    if (!canWrite || reason.trim().length === 0) return;
    setIsSubmitting(true);
    try {
      await deleteSlaRule(rule.id, reason.trim());
      await data.load();
    } catch (error) {
      data.setErrorKey(mapSlaError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const removeProfile = async (reason: string) => {
    if (!canWrite || data.selected === undefined || reason.trim().length === 0) {
      return;
    }
    setIsSubmitting(true);
    try {
      await deleteSlaProfile(data.selected.id, reason.trim());
      data.clearSelection();
      await data.load();
    } catch (error) {
      data.setErrorKey(mapSlaError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

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
            {canWrite ? (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => data.startCreate()}
              >
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
          pauses={data.pauses}
          canWrite={canWrite}
          errorKey={data.errorKey}
          isSubmitting={isSubmitting}
          onSaveProfile={saveProfile}
          onSaveRule={saveRule}
          onDeleteRule={removeRule}
          onDeleteProfile={removeProfile}
        />
      </div>
    </section>
  );
}
