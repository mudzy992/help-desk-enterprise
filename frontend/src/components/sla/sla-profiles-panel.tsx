import { Timer } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SlaChangeLogPanel } from "@/components/sla/sla-change-log-panel";
import { SlaProfileForm } from "@/components/sla/sla-profile-form";
import { SlaRuleForm } from "@/components/sla/sla-rule-form";
import { SlaRulesTable } from "@/components/sla/sla-rules-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { controlClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
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
    <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
      <Card>
        <CardHeader title={t("sla.profilesHeading")} />
        <div className="px-4 py-3.5">
          {admin.isLoading ? (
            <PanelSkeleton className="mt-0" label={t("sla.profilesHeading")} />
          ) : admin.profiles.length === 0 ? (
            <EmptyState icon={<Timer size={18} />} title={t("sla.profilesEmptyTitle")} body={t("sla.profilesEmptyBody")} />
          ) : (
            <ul className="space-y-1.5">
              {admin.profiles.map((profile) => (
                <li key={profile.id}>
                  <button
                    type="button"
                    className={`w-full rounded-md border px-3 py-2 text-left text-[12.5px] ${
                      profile.id === admin.selectedId
                        ? "border-primary/50 bg-primary/8"
                        : "border-border bg-surface hover:bg-elevated/40"
                    }`}
                    onClick={() => admin.setSelectedId(profile.id)}
                  >
                    <span className="font-medium">{profile.name}</span>
                    <span className="mt-1 block text-[11px] text-muted-foreground">{profile.calendarName}</span>
                    <Badge tone={profile.isActive ? "success" : "neutral"} className="mt-1.5">
                      {profile.isActive ? t("sla.active") : t("sla.inactive")}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button className="mt-3" variant="outline" size="sm" onClick={() => admin.setSelectedId(null)}>
            {t("sla.newProfile")}
          </Button>
        </div>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader
            title={admin.selected ? admin.selected.name : t("sla.newProfile")}
            actions={
              admin.selected ? (
                <div className="flex items-center gap-2">
                  <input className={`${controlClassName} h-8 w-44`} value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} placeholder={t("sla.reason")} />
                  <Button variant="destructive" size="xs" onClick={() => void removeProfile()}>{t("sla.delete")}</Button>
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
          <>
            <Card>
              <CardHeader title={t("sla.rulesHeading")} subtitle={t("sla.rulesHint")} />
              <div className="space-y-4 px-4 py-3.5">
                {admin.rules.length > 0 ? (
                  <SlaRulesTable rules={admin.rules} onEdit={setEditingRule} onDelete={(rule) => void removeRule(rule)} />
                ) : (
                  <EmptyState title={t("sla.rulesEmptyTitle")} body={t("sla.rulesEmptyBody")} />
                )}
                <SlaRuleForm
                  key={editingRule?.id ?? "new-rule"}
                  rule={editingRule}
                  errorKey={admin.errorKey}
                  isSubmitting={isSubmitting}
                  onSubmit={saveRule}
                />
              </div>
            </Card>
            <Card>
              <CardHeader title={t("sla.changeLogHeading")} subtitle={t("sla.changeLogHint")} />
              <div className="px-4 py-3.5">
                <SlaChangeLogPanel entries={admin.changes} />
              </div>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  );
}
