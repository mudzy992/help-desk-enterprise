import { useTranslation } from "react-i18next";
import { SlaCalendarWeekGrid } from "@/components/sla/sla-calendar-week-grid";
import { SlaChangeLogPanel } from "@/components/sla/sla-change-log-panel";
import { SlaRuleForm } from "@/components/sla/sla-rule-form";
import { SlaRulesTable } from "@/components/sla/sla-rules-table";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type {
  BusinessHoursCalendar,
  RuleWriteInput,
  SlaChangeLogEntry,
  SlaRule,
} from "@/services/sla-api";

interface SlaProfileAdminExtrasProperties {
  readonly calendar?: BusinessHoursCalendar;
  readonly rules: readonly SlaRule[];
  readonly changes: readonly SlaChangeLogEntry[];
  readonly editingRule: SlaRule | undefined;
  readonly errorKey: string | null;
  readonly isSubmitting: boolean;
  readonly onEditRule: (rule: SlaRule) => void;
  readonly onDeleteRule: (rule: SlaRule) => void;
  readonly onSubmitRule: (input: RuleWriteInput) => Promise<void>;
}

export function SlaProfileAdminExtras({
  calendar,
  rules,
  changes,
  editingRule,
  errorKey,
  isSubmitting,
  onEditRule,
  onDeleteRule,
  onSubmitRule,
}: SlaProfileAdminExtrasProperties) {
  const { t } = useTranslation();

  return (
    <>
      {calendar ? (
        <Card>
          <CardHeader
            title={calendar.name}
            subtitle={`${t("sla.weeklyHours")} · ${calendar.timezone}`}
          />
          <SlaCalendarWeekGrid calendar={calendar} />
        </Card>
      ) : null}
      <Card>
        <CardHeader title={t("sla.rulesHeading")} subtitle={t("sla.rulesHint")} />
        <div className="space-y-4 px-4 py-3.5">
          {rules.length > 0 ? (
            <SlaRulesTable rules={rules} onEdit={onEditRule} onDelete={onDeleteRule} />
          ) : (
            <EmptyState title={t("sla.rulesEmptyTitle")} body={t("sla.rulesEmptyBody")} />
          )}
          <SlaRuleForm
            key={editingRule?.id ?? "new-rule"}
            rule={editingRule}
            errorKey={errorKey}
            isSubmitting={isSubmitting}
            onSubmit={onSubmitRule}
          />
        </div>
      </Card>
      <Card>
        <CardHeader title={t("sla.changeLogHeading")} subtitle={t("sla.changeLogHint")} />
        <div className="px-4 py-3.5">
          <SlaChangeLogPanel entries={changes} />
        </div>
      </Card>
    </>
  );
}
