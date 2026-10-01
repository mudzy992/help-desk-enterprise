import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { Field, Select, Textarea } from "@/components/ui/field";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { mapApiError } from "@/lib/map-api-error";
import { mapProblemError, problemResolveSkipKeys } from "@/lib/problems/problem-view";
import { getProblemResolvePreview, problemDetailKeys, type ProblemResolvePreview } from "@/services/problems-api";

export type ProblemResolveTicketsValue = {
  readonly enabled: boolean;
  readonly message: string;
  readonly closeCode: string;
};

/** Minimum length of the message to requesters (server: reasonMin). */
export const problemResolveMessageMin = 5;

/** The group resolution can be submitted: off, or a message, a close code when required and something to resolve. */
export function isResolveTicketsValid(value: ProblemResolveTicketsValue, preview: ProblemResolvePreview | undefined): boolean {
  if (!value.enabled) return true;
  if (preview === undefined || preview.resolvable === 0) return false;
  if (value.message.trim().length < problemResolveMessageMin) return false;
  return !preview.closeCodes.required || value.closeCode !== "";
}

interface ProblemResolveTicketsSectionProperties {
  readonly problemId: string;
  readonly value: ProblemResolveTicketsValue;
  readonly onChange: (value: ProblemResolveTicketsValue) => void;
  readonly disabled: boolean;
}

/**
 * Paket 3.3 (P4, §8.4): optional group resolution when a problem becomes
 * RESOLVED. Nothing is preselected: the agent ticks the box, reviews which
 * open tickets will be resolved (and why others are skipped) and edits the
 * public message the requesters receive.
 */
export function ProblemResolveTicketsSection({ problemId, value, onChange, disabled }: ProblemResolveTicketsSectionProperties) {
  const { t } = useTranslation();
  const preview = useQuery({
    queryKey: problemDetailKeys.resolvePreview(problemId),
    queryFn: () => getProblemResolvePreview(problemId),
    retry: false,
  });
  const data = preview.data;
  const openCount = data?.items.length ?? 0;

  if (preview.isLoading) return <PanelSkeleton label={t("problems.resolveTickets.loading")} />;
  if (preview.error) {
    return (
      <p role="alert" className={errorTextClassName}>
        {t(mapProblemError(preview.error) ?? mapApiError(preview.error))}
      </p>
    );
  }
  if (data === undefined || openCount === 0) {
    return <p className={hintClassName}>{t("problems.resolveTickets.none")}</p>;
  }

  const skipped = data.items.filter((item) => !item.resolvable);
  return (
    <div className="grid gap-3 rounded-md border border-border bg-muted/30 p-3" data-testid="problem-resolve-tickets">
      <Checkbox
        checked={value.enabled}
        disabled={disabled || data.resolvable === 0}
        onChange={(event) => onChange({ ...value, enabled: event.target.checked })}
        label={t("problems.resolveTickets.toggle", { count: data.resolvable })}
        data-testid="problem-resolve-tickets-toggle"
      />
      <p className={hintClassName}>{t("problems.resolveTickets.hint", { open: openCount })}</p>
      {value.enabled ? (
        <>
          <ul className="grid max-h-56 gap-1 overflow-y-auto text-[12.5px]" aria-label={t("problems.resolveTickets.listLabel")}>
            {data.items.map((item) => (
              <li key={item.id} className="flex min-w-0 items-center gap-2">
                <span className="tnum shrink-0 font-medium text-foreground">{item.ticketNumber}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.title ?? t("problems.tickets.confidential")}</span>
                {item.resolvable ? (
                  <Badge tone="success">{t("problems.resolveTickets.willResolve")}</Badge>
                ) : (
                  <Badge tone="neutral">{t(problemResolveSkipKeys[item.reason ?? "no_access"])}</Badge>
                )}
              </li>
            ))}
          </ul>
          {skipped.length > 0 ? <p className={hintClassName}>{t("problems.resolveTickets.skippedHint", { count: skipped.length })}</p> : null}
          <Field
            label={t("problems.resolveTickets.message")}
            required
            hint={t("problems.resolveTickets.messageHint", { min: problemResolveMessageMin })}
          >
            {(control) => (
              <Textarea
                {...control}
                rows={5}
                maxLength={8000}
                value={value.message}
                disabled={disabled}
                onChange={(event) => onChange({ ...value, message: event.target.value })}
                data-testid="problem-resolve-tickets-message"
              />
            )}
          </Field>
          {data.closeCodes.enabled && data.closeCodes.codes.length > 0 ? (
            <Field label={t("problems.resolveTickets.closeCode")} required={data.closeCodes.required}>
              {(control) => (
                <Select {...control} value={value.closeCode} disabled={disabled} onChange={(event) => onChange({ ...value, closeCode: event.target.value })}>
                  <option value="">{t("problems.resolveTickets.closeCodeNone")}</option>
                  {data.closeCodes.codes.map((code) => (
                    <option key={code.key} value={code.key}>
                      {code.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
