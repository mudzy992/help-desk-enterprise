import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SlaEscalationRuleForm } from "@/components/sla/sla-escalation-rule-form";
import { SlaEscalationRulesTable } from "@/components/sla/sla-escalation-rules-table";
import { Card, CardHeader } from "@/components/ui/card";
import { controlClassName } from "@/components/ui/control";
import { mapSlaError, type SlaErrorKey } from "@/lib/sla/map-sla-error";
import {
  createSlaEscalationRule,
  deleteSlaEscalationRule,
  listSlaEscalationRules,
  listSlaProfiles,
  updateSlaEscalationRule,
  type EscalationRuleWriteInput,
  type SlaEscalationRule,
  type SlaProfile,
} from "@/services/sla-api";

export function SlaEscalationRulesPanel() {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<SlaProfile[]>([]);
  const [profileId, setProfileId] = useState("");
  const [rules, setRules] = useState<SlaEscalationRule[]>([]);
  const [editing, setEditing] = useState<SlaEscalationRule | undefined>();
  const [deleteReason, setDeleteReason] = useState("");
  const [errorKey, setErrorKey] = useState<SlaErrorKey | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadRules = async (nextProfileId: string) => {
    if (nextProfileId.length === 0) {
      setRules([]);
      return;
    }
    setRules([...(await listSlaEscalationRules(nextProfileId))]);
  };

  useEffect(() => {
    void listSlaProfiles().then((items) => {
      setProfiles([...items]);
      const firstId = items[0]?.id ?? "";
      setProfileId(firstId);
      void loadRules(firstId);
    });
  }, []);

  const handleSave = async (input: EscalationRuleWriteInput) => {
    if (profileId.length === 0) return;
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      if (editing === undefined) {
        await createSlaEscalationRule({ ...input, slaProfileId: profileId });
      } else {
        await updateSlaEscalationRule(editing.id, input);
      }
      setEditing(undefined);
      await loadRules(profileId);
    } catch (error) {
      setErrorKey(mapSlaError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (rule: SlaEscalationRule) => {
    if (deleteReason.trim().length === 0) return;
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      await deleteSlaEscalationRule(rule.id, deleteReason);
      setDeleteReason("");
      await loadRules(profileId);
    } catch (error) {
      setErrorKey(mapSlaError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid gap-4">
      <label className="grid max-w-md gap-1 text-sm">
        {t("sla.profilesHeading")}
        <select
          className={controlClassName}
          value={profileId}
          onChange={(event) => {
            setProfileId(event.target.value);
            setEditing(undefined);
            void loadRules(event.target.value);
          }}
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>{profile.name}</option>
          ))}
        </select>
      </label>
      <Card>
        <CardHeader title={t("sla.escalationsHeading")} subtitle={t("sla.escalationsHint")} />
        <SlaEscalationRulesTable
          rules={rules}
          onEdit={setEditing}
          onDelete={(rule) => void handleDelete(rule)}
        />
      </Card>
      <Card>
        <CardHeader title={editing ? t("sla.editEscalation") : t("sla.newEscalation")} />
        <div className="p-4">
          <SlaEscalationRuleForm
            rule={editing}
            errorKey={errorKey}
            isSubmitting={isSubmitting}
            onSubmit={handleSave}
          />
          <label className="mt-3 grid max-w-md gap-1 text-sm">
            {t("sla.reason")}
            <input
              className={controlClassName}
              value={deleteReason}
              onChange={(event) => setDeleteReason(event.target.value)}
              placeholder={t("sla.deleteReasonPlaceholder")}
            />
          </label>
        </div>
      </Card>
    </div>
  );
}
