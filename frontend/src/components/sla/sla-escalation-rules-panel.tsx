import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { EntityDetailQueryError } from "@/components/entity-list/entity-detail-query-error";
import { SlaEscalationRuleForm } from "@/components/sla/sla-escalation-rule-form";
import { SlaEscalationRulesTable } from "@/components/sla/sla-escalation-rules-table";
import { Card, CardHeader } from "@/components/ui/card";
import { controlClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { createLatestRequestGuard } from "@/lib/async/latest-request-guard";
import { readApiRequestId } from "@/lib/map-api-error";
import { mapSlaError, type SlaErrorKey } from "@/lib/sla/map-sla-error";
import type { SlaQueryError } from "@/lib/sla/use-sla-page-data";
import { useSlaEscalationGroupNames } from "@/lib/sla/use-sla-escalation-group-names";
import {
  createSlaEscalationRule,
  deleteSlaEscalationRule,
  listSlaEscalationRules,
  updateSlaEscalationRule,
  type EscalationRuleWriteInput,
  type SlaEscalationRule,
} from "@/services/sla-api";

interface SlaEscalationRulesPanelProperties {
  readonly slaProfileId: string;
  readonly canWrite?: boolean;
  readonly embedded?: boolean;
}

export function SlaEscalationRulesPanel({
  slaProfileId,
  canWrite = true,
  embedded = false,
}: SlaEscalationRulesPanelProperties) {
  const { t } = useTranslation();
  const groupNames = useSlaEscalationGroupNames();
  const [rules, setRules] = useState<SlaEscalationRule[]>([]);
  const [editing, setEditing] = useState<SlaEscalationRule | undefined>();
  const [deleteReason, setDeleteReason] = useState("");
  const [errorKey, setErrorKey] = useState<SlaErrorKey | null>(null);
  const [loadError, setLoadError] = useState<SlaQueryError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reasonRequired, setReasonRequired] = useState(false);
  const loadGuard = useRef(createLatestRequestGuard());

  const reload = useCallback(async () => {
    const request = loadGuard.current.begin();
    setLoadError(null);
    setIsLoading(true);
    try {
      const items = await listSlaEscalationRules(slaProfileId);
      if (loadGuard.current.isCurrent(request)) setRules([...items]);
    } catch (error) {
      if (loadGuard.current.isCurrent(request)) {
        setLoadError({ key: mapSlaError(error), requestId: readApiRequestId(error) });
      }
    } finally {
      if (loadGuard.current.isCurrent(request)) setIsLoading(false);
    }
  }, [slaProfileId]);

  useEffect(() => {
    const guard = loadGuard.current;
    setEditing(undefined);
    setRules([]);
    setLoadError(null);
    if (slaProfileId.length === 0) {
      setRules([]);
      return;
    }
    void reload();
    return () => guard.cancel();
  }, [reload, slaProfileId]);

  const handleSave = async (input: EscalationRuleWriteInput) => {
    if (!canWrite || slaProfileId.length === 0) return;
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      if (editing === undefined) {
        await createSlaEscalationRule({ ...input, slaProfileId });
      } else {
        await updateSlaEscalationRule(editing.id, input);
      }
      setEditing(undefined);
      await reload();
    } catch (error) {
      setErrorKey(mapSlaError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (rule: SlaEscalationRule) => {
    if (!canWrite) return;
    if (deleteReason.trim().length === 0) {
      setReasonRequired(true);
      return;
    }
    setReasonRequired(false);
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      await deleteSlaEscalationRule(rule.id, deleteReason.trim());
      setDeleteReason("");
      await reload();
    } catch (error) {
      setErrorKey(mapSlaError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const table = loadError ? (
    <EntityDetailQueryError
      messageKey={loadError.key}
      requestId={loadError.requestId}
      retrying={isLoading}
      onRetry={() => void reload()}
    />
  ) : isLoading ? (
    <PanelSkeleton label={t("ui.loading")} />
  ) : rules.length === 0 ? (
    <EmptyState title={t("sla.escalationsHeading")} body={t("sla.escalationsEmptyBody")} />
  ) : (
    <SlaEscalationRulesTable
      rules={rules}
      groupNames={groupNames}
      canWrite={canWrite}
      onEdit={setEditing}
      onDelete={(rule) => void handleDelete(rule)}
    />
  );

  const form = canWrite ? (
    <div className={embedded ? "mt-3 space-y-3" : "p-4"}>
      <SlaEscalationRuleForm
        rule={editing}
        errorKey={errorKey}
        isSubmitting={isSubmitting}
        onSubmit={handleSave}
      />
      <label className="grid max-w-md gap-1 text-sm">
        {t("sla.reason")}
        <input
          className={controlClassName}
          value={deleteReason}
          onChange={(event) => setDeleteReason(event.target.value)}
          placeholder={t("sla.deleteReasonPlaceholder")}
        />
      </label>
      {reasonRequired ? (
        <p role="alert" className="text-[12px] text-danger">
          {t("sla.deleteReasonRequired")}
        </p>
      ) : null}
    </div>
  ) : null;

  if (embedded) {
    return (
      <div className="space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {t("sla.escalationsHeading")}
        </p>
        {table}
        {form}
      </div>
    );
  }

  return (
    <div className="fade-in grid gap-4">
      <Card>
        <CardHeader title={t("sla.escalationsHeading")} subtitle={t("sla.escalationsHint")} />
        {table}
      </Card>
      {canWrite ? (
        <Card>
          <CardHeader title={editing ? t("sla.editEscalation") : t("sla.newEscalation")} />
          {form}
        </Card>
      ) : null}
    </div>
  );
}
