import { useTranslation } from "react-i18next";
import { SlaBaselineRulesEditor } from "@/components/sla/sla-baseline-rules-editor";
import { SlaChangeLogPanel } from "@/components/sla/sla-change-log-panel";
import { SlaEditDrawer } from "@/components/sla/sla-edit-drawer";
import { SlaEscalationRulesPanel } from "@/components/sla/sla-escalation-rules-panel";
import { SlaProfileForm } from "@/components/sla/sla-profile-form";
import { SlaRuleForm } from "@/components/sla/sla-rule-form";
import { SlaRulesTable } from "@/components/sla/sla-rules-table";
import { isBaselineSlaRule } from "@/lib/sla/select-baseline-sla-rules";
import type {
  BusinessHoursCalendar,
  ProfileWriteInput,
  RuleWriteInput,
  SlaChangeLogEntry,
  SlaProfile,
  SlaRule,
} from "@/services/sla-api";

export type SlaDrawerKind = "profile" | "history" | "overrides" | "escalations" | null;

interface SlaProfileDetailDrawersProperties {
  readonly drawer: SlaDrawerKind;
  readonly profile: SlaProfile;
  readonly calendars: readonly BusinessHoursCalendar[];
  readonly baseline: readonly SlaRule[];
  readonly overrides: readonly SlaRule[];
  readonly changes: readonly SlaChangeLogEntry[];
  readonly canWrite: boolean;
  readonly errorKey: string | null;
  readonly isSubmitting: boolean;
  readonly editingRule: SlaRule | undefined;
  readonly deleteReason: string;
  readonly onClose: () => void;
  readonly onEditingRuleChange: (rule: SlaRule | undefined) => void;
  readonly onDeleteReasonChange: (value: string) => void;
  readonly onSaveProfile: (
    input: ProfileWriteInput & { readonly key: string },
  ) => Promise<void>;
  readonly onSaveRule: (input: RuleWriteInput, editing?: SlaRule) => Promise<void>;
  readonly onDeleteRule: (rule: SlaRule, reason: string) => Promise<void>;
  readonly onDeleteProfile: (reason: string) => Promise<void>;
}

export function SlaProfileDetailDrawers({
  drawer,
  profile,
  calendars,
  baseline,
  overrides,
  changes,
  canWrite,
  errorKey,
  isSubmitting,
  editingRule,
  deleteReason,
  onClose,
  onEditingRuleChange,
  onDeleteReasonChange,
  onSaveProfile,
  onSaveRule,
  onDeleteRule,
  onDeleteProfile,
}: SlaProfileDetailDrawersProperties) {
  const { t } = useTranslation();
  const overrideEdit =
    editingRule && !isBaselineSlaRule(editingRule) ? editingRule : undefined;

  return (
    <>
      <SlaEditDrawer
        open={drawer === "profile"}
        title={t("sla.drawerProfileTitle")}
        description={t("sla.drawerProfileHint")}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <div className="space-y-6">
          <SlaProfileForm
            key={profile.id}
            profile={profile}
            calendars={calendars}
            errorKey={errorKey}
            isSubmitting={isSubmitting}
            onSubmit={async (input) => {
              await onSaveProfile(input);
              onClose();
            }}
          />
          <SlaBaselineRulesEditor
            rules={baseline}
            editingRule={editingRule}
            errorKey={errorKey}
            isSubmitting={isSubmitting}
            deleteReason={deleteReason}
            onDeleteReasonChange={onDeleteReasonChange}
            onEdit={onEditingRuleChange}
            onDeleteRule={(rule) => void onDeleteRule(rule, deleteReason)}
            onSaveRule={onSaveRule}
            onClearEditing={() => onEditingRuleChange(undefined)}
            onDeleteProfile={() => void onDeleteProfile(deleteReason)}
          />
        </div>
      </SlaEditDrawer>

      <SlaEditDrawer
        open={drawer === "history"}
        title={t("sla.changeLogHeading")}
        description={t("sla.changeLogHint")}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <SlaChangeLogPanel entries={changes} />
      </SlaEditDrawer>

      <SlaEditDrawer
        open={drawer === "overrides"}
        title={t("sla.drawerOverridesTitle")}
        description={t("sla.overrideRulesHint")}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <div className="space-y-4">
          {overrides.length > 0 ? (
            <SlaRulesTable
              rules={overrides}
              onEdit={onEditingRuleChange}
              onDelete={(rule) => void onDeleteRule(rule, deleteReason)}
            />
          ) : null}
          <SlaRuleForm
            key={overrideEdit?.id ?? "new-override-rule"}
            rule={overrideEdit}
            errorKey={errorKey}
            isSubmitting={isSubmitting}
            requireMatch
            onSubmit={async (input) => {
              await onSaveRule(input, overrideEdit);
              onEditingRuleChange(undefined);
            }}
          />
        </div>
      </SlaEditDrawer>

      <SlaEditDrawer
        open={drawer === "escalations"}
        title={t("sla.drawerEscalationsTitle")}
        description={t("sla.escalationsHint")}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <SlaEscalationRulesPanel
          slaProfileId={profile.id}
          canWrite={canWrite}
          embedded
        />
      </SlaEditDrawer>
    </>
  );
}
