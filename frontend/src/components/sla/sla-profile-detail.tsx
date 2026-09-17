import { useState } from "react";
import { SlaBaselineRulesEditor } from "@/components/sla/sla-baseline-rules-editor";
import { SlaCalendarDetailCard } from "@/components/sla/sla-calendar-detail-card";
import { SlaChangeLogPanel } from "@/components/sla/sla-change-log-panel";
import { SlaComplianceCard } from "@/components/sla/sla-compliance-card";
import { SlaOverrideRulesCard } from "@/components/sla/sla-override-rules-card";
import { SlaPausesEscalationsCard } from "@/components/sla/sla-pauses-escalations-card";
import { SlaPriorityTargetsTable } from "@/components/sla/sla-priority-targets-table";
import { SlaProfileDetailHeader } from "@/components/sla/sla-profile-detail-header";
import { SlaProfileForm } from "@/components/sla/sla-profile-form";
import {
  isBaselineSlaRule,
  selectBaselineSlaRules,
  selectOverrideSlaRules,
} from "@/lib/sla/select-baseline-sla-rules";
import type { SlaPauseSettings } from "@/lib/sla/use-sla-page-data";
import type {
  BusinessHoursCalendar,
  ProfileWriteInput,
  RuleWriteInput,
  SlaChangeLogEntry,
  SlaComplianceResponse,
  SlaProfile,
  SlaRule,
} from "@/services/sla-api";
import type { TicketResponse } from "@/services/tickets-api";

interface SlaProfileDetailProperties {
  readonly profile: SlaProfile | undefined;
  readonly calendars: readonly BusinessHoursCalendar[];
  readonly calendar: BusinessHoursCalendar | undefined;
  readonly rules: readonly SlaRule[];
  readonly changes: readonly SlaChangeLogEntry[];
  readonly tickets: readonly TicketResponse[];
  readonly compliance: SlaComplianceResponse | null;
  readonly pauses: SlaPauseSettings;
  readonly canWrite: boolean;
  readonly errorKey: string | null;
  readonly isSubmitting: boolean;
  readonly onSaveProfile: (
    input: ProfileWriteInput & { readonly key: string },
  ) => Promise<void>;
  readonly onSaveRule: (input: RuleWriteInput, editing?: SlaRule) => Promise<void>;
  readonly onDeleteRule: (rule: SlaRule, reason: string) => Promise<void>;
  readonly onDeleteProfile: (reason: string) => Promise<void>;
}

export function SlaProfileDetail({
  profile,
  calendars,
  calendar,
  rules,
  changes,
  tickets,
  compliance,
  pauses,
  canWrite,
  errorKey,
  isSubmitting,
  onSaveProfile,
  onSaveRule,
  onDeleteRule,
  onDeleteProfile,
}: SlaProfileDetailProperties) {
  const [showHistory, setShowHistory] = useState(false);
  const [showEdit, setShowEdit] = useState(profile === undefined);
  const [editingRule, setEditingRule] = useState<SlaRule | undefined>();
  const [deleteReason, setDeleteReason] = useState("");
  const baseline = selectBaselineSlaRules(rules);
  const overrides = selectOverrideSlaRules(rules);
  const overrideEdit =
    editingRule && !isBaselineSlaRule(editingRule) ? editingRule : undefined;

  if (profile === undefined) {
    return (
      <SlaProfileDetailHeader
        profile={undefined}
        canWrite={canWrite}
        showHistory={false}
        showEdit
        onToggleHistory={() => undefined}
        onToggleEdit={() => undefined}
      >
        <div className="px-4 py-3.5">
          {canWrite ? (
            <SlaProfileForm
              calendars={calendars}
              errorKey={errorKey}
              isSubmitting={isSubmitting}
              onSubmit={onSaveProfile}
            />
          ) : null}
        </div>
      </SlaProfileDetailHeader>
    );
  }

  return (
    <div className="space-y-4">
      <SlaProfileDetailHeader
        profile={profile}
        canWrite={canWrite}
        showHistory={showHistory}
        showEdit={showEdit}
        onToggleHistory={() => setShowHistory((value) => !value)}
        onToggleEdit={() => setShowEdit((value) => !value)}
      >
        <SlaPriorityTargetsTable
          rules={baseline}
          tickets={tickets}
          slaProfileId={profile.id}
          calendarLabel={calendar?.name ?? profile.calendarName}
        />
        {canWrite ? (
          <SlaBaselineRulesEditor
            rules={baseline}
            editingRule={editingRule}
            errorKey={errorKey}
            isSubmitting={isSubmitting}
            deleteReason={deleteReason}
            onDeleteReasonChange={setDeleteReason}
            onEdit={setEditingRule}
            onDeleteRule={(rule) => void onDeleteRule(rule, deleteReason)}
            onSaveRule={onSaveRule}
            onClearEditing={() => setEditingRule(undefined)}
            onDeleteProfile={() => void onDeleteProfile(deleteReason)}
          />
        ) : null}
        {showEdit && canWrite ? (
          <div className="border-t border-border/60 px-4 py-3.5">
            <SlaProfileForm
              key={profile.id}
              profile={profile}
              calendars={calendars}
              errorKey={errorKey}
              isSubmitting={isSubmitting}
              onSubmit={onSaveProfile}
            />
          </div>
        ) : null}
        {showHistory ? (
          <div className="border-t border-border/60 px-4 py-3.5">
            <SlaChangeLogPanel entries={changes} />
          </div>
        ) : null}
      </SlaProfileDetailHeader>

      <SlaOverrideRulesCard
        rules={overrides}
        editingRule={overrideEdit}
        canWrite={canWrite}
        errorKey={errorKey}
        isSubmitting={isSubmitting}
        onEdit={setEditingRule}
        onDelete={(rule) => void onDeleteRule(rule, deleteReason)}
        onSubmit={async (input) => {
          await onSaveRule(input, overrideEdit);
          setEditingRule(undefined);
        }}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SlaCalendarDetailCard calendar={calendar} />
        <SlaPausesEscalationsCard
          slaProfileId={profile.id}
          pauses={pauses}
          canWrite={canWrite}
        />
      </div>

      <SlaComplianceCard compliance={compliance} slaProfileId={profile.id} />
    </div>
  );
}
