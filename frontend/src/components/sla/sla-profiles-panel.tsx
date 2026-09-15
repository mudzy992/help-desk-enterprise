import { CalendarDays, TimerReset } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  SlaAdminListColumn,
  SlaAdminSelectorCard,
} from "@/components/sla/sla-admin-selector";
import { SlaProfileAdminExtras } from "@/components/sla/sla-profile-admin-extras";
import { SlaProfileForm } from "@/components/sla/sla-profile-form";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { controlClassName } from "@/components/ui/control";
import { mapSlaError } from "@/lib/sla/map-sla-error";
import { useSlaProfilesAdmin } from "@/lib/sla/use-sla-profiles-admin";
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

export function SlaProfilesPanel() {
  const { t } = useTranslation();
  const admin = useSlaProfilesAdmin();
  const [editingRule, setEditingRule] = useState<SlaRule | undefined>(undefined);
  const [deleteReason, setDeleteReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedCalendar = admin.calendars.find(
    (calendar) => calendar.id === admin.selected?.calendarId,
  );

  const saveProfile = async (input: ProfileWriteInput & { readonly key: string }) => {
    setIsSubmitting(true);
    admin.setErrorKey(null);
    try {
      if (admin.selected === undefined) {
        const created = await createSlaProfile(input);
        admin.setSelectedId(created.id);
      } else {
        await updateSlaProfile(admin.selected.id, input);
      }
      await admin.load();
    } catch (error) {
      admin.setErrorKey(mapSlaError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveRule = async (input: RuleWriteInput) => {
    if (admin.selected === undefined) {
      return;
    }
    setIsSubmitting(true);
    admin.setErrorKey(null);
    try {
      if (editingRule === undefined) {
        await createSlaRule({ ...input, slaProfileId: admin.selected.id });
      } else {
        await updateSlaRule(editingRule.id, input);
      }
      setEditingRule(undefined);
      await admin.load();
    } catch (error) {
      admin.setErrorKey(mapSlaError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const removeProfile = async () => {
    if (admin.selected === undefined || deleteReason.trim().length === 0) {
      return;
    }
    setIsSubmitting(true);
    try {
      await deleteSlaProfile(admin.selected.id, deleteReason.trim());
      admin.setSelectedId(null);
      setDeleteReason("");
      await admin.load();
    } catch (error) {
      admin.setErrorKey(mapSlaError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const removeRule = async (rule: SlaRule) => {
    if (deleteReason.trim().length === 0) {
      return;
    }
    setIsSubmitting(true);
    try {
      await deleteSlaRule(rule.id, deleteReason.trim());
      await admin.load();
    } catch (error) {
      admin.setErrorKey(mapSlaError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
      <SlaAdminListColumn
        isLoading={admin.isLoading}
        isEmpty={admin.profiles.length === 0}
        loadingLabel={t("sla.profilesHeading")}
        emptyTitle={t("sla.profilesEmptyTitle")}
        emptyBody={t("sla.profilesEmptyBody")}
        newLabel={t("sla.newProfile")}
        onNew={() => admin.setSelectedId(null)}
      >
        {admin.profiles.map((profile) => (
          <SlaAdminSelectorCard
            key={profile.id}
            isSelected={profile.id === admin.selectedId}
            onSelect={() => admin.setSelectedId(profile.id)}
            code={profile.key}
            title={profile.name}
            description={profile.description}
            metaIcon={CalendarDays}
            metaLabel={profile.calendarName}
            badgeLabel={profile.isActive ? t("sla.active") : t("sla.inactive")}
            badgeTone={profile.isActive ? "success" : "neutral"}
          />
        ))}
      </SlaAdminListColumn>
      <div className="space-y-4">
        <Card>
          <CardHeader
            title={
              admin.selected ? (
                <span className="flex items-center gap-2">
                  <TimerReset size={15} className="text-[#7FA8F5]" />
                  {admin.selected.name}{" "}
                  <span className="tnum text-muted/70">({admin.selected.key})</span>
                </span>
              ) : (
                t("sla.newProfile")
              )
            }
            actions={
              admin.selected ? (
                <div className="flex items-center gap-2">
                  <input
                    className={`${controlClassName} h-8 w-44`}
                    value={deleteReason}
                    onChange={(event) => setDeleteReason(event.target.value)}
                    placeholder={t("sla.reason")}
                  />
                  <Button variant="destructive" size="xs" onClick={() => void removeProfile()}>
                    {t("sla.delete")}
                  </Button>
                </div>
              ) : null
            }
          />
          <div className="px-4 py-3.5">
            <SlaProfileForm
              key={admin.selected?.id ?? "new"}
              profile={admin.selected}
              calendars={admin.calendars}
              errorKey={admin.errorKey}
              isSubmitting={isSubmitting}
              onSubmit={saveProfile}
            />
          </div>
        </Card>
        {admin.selected ? (
          <SlaProfileAdminExtras
            calendar={selectedCalendar}
            rules={admin.rules}
            changes={admin.changes}
            editingRule={editingRule}
            errorKey={admin.errorKey}
            isSubmitting={isSubmitting}
            onEditRule={setEditingRule}
            onDeleteRule={(rule) => void removeRule(rule)}
            onSubmitRule={saveRule}
          />
        ) : null}
      </div>
    </div>
  );
}
