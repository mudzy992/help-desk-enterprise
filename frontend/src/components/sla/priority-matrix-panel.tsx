import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { errorTextClassName, labelClassName } from "@/components/ui/control";
import { mapSlaError, type SlaErrorKey } from "@/lib/sla/map-sla-error";
import {
  listPriorityMatrix,
  patchPriorityMatrix,
  type PriorityMatrixCell,
} from "@/services/priority-matrix-api";
import type { TicketImpact, TicketPriority, TicketUrgency } from "@/services/tickets-api";

const levels: readonly TicketImpact[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const priorities: readonly TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const priorityLabelKey = {
  LOW: "sla.priorityLow",
  MEDIUM: "sla.priorityMedium",
  HIGH: "sla.priorityHigh",
  CRITICAL: "sla.priorityCritical",
} as const;

interface PriorityMatrixPanelProperties {
  readonly canWrite: boolean;
}

export function PriorityMatrixPanel({ canWrite }: PriorityMatrixPanelProperties) {
  const { t } = useTranslation();
  const [cells, setCells] = useState<readonly PriorityMatrixCell[]>([]);
  const [draft, setDraft] = useState<Record<string, TicketPriority>>({});
  const [reason, setReason] = useState("");
  const [errorKey, setErrorKey] = useState<SlaErrorKey | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void listPriorityMatrix()
      .then((response) => {
        setCells(response.cells);
        setDraft(toDraft(response.cells));
      })
      .catch((error) => setErrorKey(mapSlaError(error)));
  }, []);

  const dirty = cells.filter((cell) => {
    const key = cellKey(cell.impact, cell.urgency);
    return draft[key] !== undefined && draft[key] !== cell.priority;
  });

  const handleSave = async () => {
    if (!canWrite || dirty.length === 0 || reason.trim().length === 0) return;
    setIsSaving(true);
    setErrorKey(null);
    try {
      const response = await patchPriorityMatrix({
        reason: reason.trim(),
        cells: dirty.map((cell) => ({
          impact: cell.impact,
          urgency: cell.urgency,
          priority: draft[cellKey(cell.impact, cell.urgency)] ?? cell.priority,
        })),
      });
      setCells(response.cells);
      setDraft(toDraft(response.cells));
      setReason("");
    } catch (error) {
      setErrorKey(mapSlaError(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fade-in space-y-4">
      <p className="text-[13px] text-muted-foreground">{t("sla.priorityMatrixHint")}</p>
      {errorKey ? (
        <p role="alert" className={errorTextClassName}>
          {t(errorKey)}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[12px]">
          <thead>
            <tr>
              <th className="border border-border px-2 py-1.5 text-left font-medium">
                {t("sla.priorityMatrixImpact")} × {t("sla.priorityMatrixUrgency")}
              </th>
              {levels.map((urgency) => (
                <th key={urgency} className="border border-border px-2 py-1.5 font-medium">
                  {t(priorityLabelKey[urgency])}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {levels.map((impact) => (
              <tr key={impact}>
                <th className="border border-border px-2 py-1.5 text-left font-medium">
                  {t(priorityLabelKey[impact])}
                </th>
                {levels.map((urgency) => {
                  const key = cellKey(impact, urgency);
                  const value = draft[key] ?? "MEDIUM";
                  return (
                    <td key={key} className="border border-border px-1.5 py-1">
                      <select
                        className="w-full rounded-lg border border-border bg-surface px-1.5 py-1"
                        disabled={!canWrite || isSaving}
                        value={value}
                        aria-label={`${impact} × ${urgency}`}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            [key]: event.target.value as TicketPriority,
                          }))
                        }
                      >
                        {priorities.map((priority) => (
                          <option key={priority} value={priority}>
                            {t(priorityLabelKey[priority])}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canWrite ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className={`flex-1 space-y-1 ${labelClassName}`}>
            <span>{t("sla.reason")}</span>
            <input
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[13px]"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t("sla.priorityMatrixReasonPlaceholder")}
            />
          </label>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={isSaving || dirty.length === 0 || reason.trim().length === 0}
            onClick={() => void handleSave()}
          >
            {isSaving ? t("sla.saving") : t("sla.priorityMatrixSave")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function cellKey(impact: TicketImpact, urgency: TicketUrgency): string {
  return `${impact}:${urgency}`;
}

function toDraft(cells: readonly PriorityMatrixCell[]): Record<string, TicketPriority> {
  return Object.fromEntries(
    cells.map((cell) => [cellKey(cell.impact, cell.urgency), cell.priority]),
  );
}
