import { CalendarDays, Grid3x3, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AdminConfigChangedBanner } from "@/components/admin/admin-config-changed-banner";
import { useAdminConfigLiveRefresh } from "@/lib/realtime/use-admin-config-live-refresh";
import { useTranslation } from "react-i18next";
import { PriorityMatrixPanel } from "@/components/sla/priority-matrix-panel";
import { SlaCalendarsPanel } from "@/components/sla/sla-calendars-panel";
import { SlaComplianceCard } from "@/components/sla/sla-compliance-card";
import { SlaProfileDetail } from "@/components/sla/sla-profile-detail";
import { SlaProfileList } from "@/components/sla/sla-profile-list";
import { Button } from "@/components/ui/button";
import { UnderlineTabs } from "@/components/ui/tabs";
import { errorTextClassName, selectCompactClassName } from "@/components/ui/control";
import { PageHeader, brandCrumb } from "@/components/ui/page-header";
import { useSlaPageData } from "@/lib/sla/use-sla-page-data";
import { useSlaPageMutations } from "@/lib/sla/use-sla-page-mutations";
import { permissionKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { flattenOriginUnitOptions } from "@/lib/tickets/ticket-display";
import { listOrganizationalUnitTree } from "@/services/organizational-units-api";

export function SlaPage() {
  const { t } = useTranslation();
  const { session, isLoading: isSessionLoading, hasPermission } = useSessionCapabilities();
  const canWrite = hasPermission(permissionKeys.slaWrite);
  const [unitOptions, setUnitOptions] = useState<readonly { id: string; label: string }[]>([]);
  const [organizationalUnitId, setOrganizationalUnitId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void listOrganizationalUnitTree()
      .then((tree) => {
        if (!cancelled) setUnitOptions(flattenOriginUnitOptions(tree));
      })
      .catch(() => {
        if (!cancelled) setUnitOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (organizationalUnitId !== null || isSessionLoading || unitOptions.length === 0) {
      return;
    }
    const preferredId = session?.organizationalUnitId;
    setOrganizationalUnitId(
      unitOptions.find((option) => option.id === preferredId)?.id ?? unitOptions[0]?.id ?? null,
    );
  }, [isSessionLoading, organizationalUnitId, session?.organizationalUnitId, unitOptions]);
  const data = useSlaPageData(organizationalUnitId);
  const scopeLabel = unitOptions.find((option) => option.id === organizationalUnitId)?.label ?? null;
  const mutations = useSlaPageMutations(data, canWrite);
  const [view, setView] = useState<"profiles" | "calendars" | "matrix">("profiles");
  const [profilesPanel, setProfilesPanel] = useState<"profiles" | "compliance">("profiles");
  const returnToProfiles = () => {
    setView("profiles");
    setProfilesPanel("profiles");
  };
  // Paket 1.7 (R3): sub-panels load on mount, so a key bump reloads them too.
  const [refreshKey, setRefreshKey] = useState(0);
  const containerRef = useRef<HTMLElement>(null);
  const live = useAdminConfigLiveRefresh({
    domains: ["sla"],
    reload: async () => {
      setRefreshKey((value) => value + 1);
      await data.load();
    },
    containerRef,
  });
  const banner = (
    <AdminConfigChangedBanner pending={live.pending} onRefresh={live.refreshNow} onDismiss={live.dismiss} />
  );
  const selectedCalendar = data.calendars.find(
    (calendar) => calendar.id === data.selected?.calendarId,
  );

  if (view === "calendars") {
    return (
      <section ref={containerRef}>
        <PageHeader
          crumbs={[brandCrumb, t("navigation.sla")]}
          title={t("sla.calendarsHeading")}
          subtitle={t("sla.intro")}
          actions={
            <Button type="button" variant="outline" size="sm" onClick={returnToProfiles}>
              {t("sla.backToProfiles")}
            </Button>
          }
        />
        {banner}
        <SlaCalendarsPanel key={refreshKey} />
      </section>
    );
  }

  if (view === "matrix") {
    return (
      <section ref={containerRef}>
        <PageHeader
          crumbs={[brandCrumb, t("navigation.sla")]}
          title={t("sla.priorityMatrixTitle")}
          subtitle={t("sla.priorityMatrixIntro")}
          actions={
            <Button type="button" variant="outline" size="sm" onClick={returnToProfiles}>
              {t("sla.backToProfiles")}
            </Button>
          }
        />
        {banner}
        <PriorityMatrixPanel key={refreshKey} canWrite={canWrite} />
      </section>
    );
  }

  return (
    <section ref={containerRef}>
      <PageHeader
        crumbs={[brandCrumb, t("navigation.sla")]}
        title={t("sla.title")}
        subtitle={t("sla.intro")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {profilesPanel === "compliance" ? (
              <label className="flex min-w-56 items-center">
                <span className="sr-only">{t("sla.complianceScope")}</span>
                <select
                  aria-label={t("sla.complianceScope")}
                  className={selectCompactClassName}
                  value={organizationalUnitId ?? ""}
                  disabled={unitOptions.length === 0}
                  onChange={(event) => setOrganizationalUnitId(event.target.value || null)}
                >
                  <option value="" disabled>
                    {t("sla.complianceScopePick")}
                  </option>
                  {unitOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={() => setView("calendars")}>
              <CalendarDays size={14} />
              {t("sla.manageCalendars")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setView("matrix")}>
              <Grid3x3 size={14} />
              {t("sla.managePriorityMatrix")}
            </Button>
            {canWrite && profilesPanel === "profiles" ? (
              <Button type="button" variant="primary" size="sm" onClick={() => data.startCreate()}>
                <Plus size={14} />
                {t("sla.newProfile")}
              </Button>
            ) : null}
          </div>
        }
      />
      {banner}
      {data.errorKey ? (
        <p role="alert" className={`mb-3 ${errorTextClassName}`}>
          {t(data.errorKey)}
        </p>
      ) : null}
      <div className="mt-2">
        <UnderlineTabs
          className="mb-4"
          ariaLabel={t("sla.title")}
          active={profilesPanel}
          onChange={(key) => setProfilesPanel(key as "profiles" | "compliance")}
          items={[
            { key: "profiles", label: t("sla.profilesTab") },
            { key: "compliance", label: t("sla.complianceTab") },
          ]}
        />
        {profilesPanel === "profiles" ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_1fr]">
            <SlaProfileList
              profiles={data.profiles}
              exposure={data.exposure}
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
              exposure={data.exposure}
              canWrite={canWrite}
              errorKey={data.errorKey}
              isSubmitting={mutations.isSubmitting}
              onSaveProfile={mutations.saveProfile}
              onSaveRule={mutations.saveRule}
              onDeleteRule={mutations.removeRule}
              onDeleteProfile={mutations.removeProfile}
            />
          </div>
        ) : (
          <SlaComplianceCard
            compliance={data.compliance}
            isLoading={data.isLoading}
            scopeLabel={scopeLabel}
          />
        )}
      </div>
    </section>
  );
}
