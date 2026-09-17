import { useState } from "react";
import { SlaCalendarDetailCard } from "@/components/sla/sla-calendar-detail-card";
import { SlaComplianceCard } from "@/components/sla/sla-compliance-card";
import { SlaEscalationsCard } from "@/components/sla/sla-escalations-card";
import { SlaOverrideRulesCard } from "@/components/sla/sla-override-rules-card";
import { SlaPriorityTargetsTable } from "@/components/sla/sla-priority-targets-table";
import {
  SlaProfileDetailDrawers,
  type SlaDrawerKind,
} from "@/components/sla/sla-profile-detail-drawers";
import { SlaProfileDetailHeader } from "@/components/sla/sla-profile-detail-header";
import { SlaProfileForm } from "@/components/sla/sla-profile-form";
import {
  selectBaselineSlaRules,
  selectOverrideSlaRules,
} from "@/lib/sla/select-baseline-sla-rules";
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
  canWrite,
  errorKey,
  isSubmitting,
  onSaveProfile,
  onSaveRule,
  onDeleteRule,
  onDeleteProfile,
}: SlaProfileDetailProperties) {
  const [drawer, setDrawer] = useState<SlaDrawerKind>(null);
  const [editingRule, setEditingRule] = useState<SlaRule | undefined>();
  const [deleteReason, setDeleteReason] = useState("");
  const [escalationRefresh, setEscalationRefresh] = useState(0);
  const baseline = selectBaselineSlaRules(rules);
  const overrides = selectOverrideSlaRules(rules);

  const closeDrawer = () => {
    setDrawer(null);
    setEditingRule(undefined);
    setEscalationRefresh((value) => value + 1);
  };

  if (profile === undefined) {
    return (
      <SlaProfileDetailHeader
        profile={undefined}
        canWrite={canWrite}
        onOpenHistory={() => undefined}
        onOpenEdit={() => undefined}
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
        onOpenHistory={() => setDrawer("history")}
        onOpenEdit={() => setDrawer("profile")}
      >
        <SlaPriorityTargetsTable
          rules={baseline}
          tickets={tickets}
          slaProfileId={profile.id}
          calendarLabel={calendar?.name ?? profile.calendarName}
        />
      </SlaProfileDetailHeader>

      <SlaOverrideRulesCard
        rules={overrides}
        canWrite={canWrite}
        onEdit={() => setDrawer("overrides")}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SlaCalendarDetailCard calendar={calendar} />
        <SlaEscalationsCard
          slaProfileId={profile.id}
          canWrite={canWrite}
          onEdit={() => setDrawer("escalations")}
          refreshKey={escalationRefresh}
        />
      </div>

      <SlaComplianceCard compliance={compliance} slaProfileId={profile.id} />

      <SlaProfileDetailDrawers
        drawer={drawer}
        profile={profile}
        calendars={calendars}
        baseline={baseline}
        overrides={overrides}
        changes={changes}
        canWrite={canWrite}
        errorKey={errorKey}
        isSubmitting={isSubmitting}
        editingRule={editingRule}
        deleteReason={deleteReason}
        onClose={closeDrawer}
        onEditingRuleChange={setEditingRule}
        onDeleteReasonChange={setDeleteReason}
        onSaveProfile={onSaveProfile}
        onSaveRule={onSaveRule}
        onDeleteRule={onDeleteRule}
        onDeleteProfile={onDeleteProfile}
      />
    </div>
  );
}
