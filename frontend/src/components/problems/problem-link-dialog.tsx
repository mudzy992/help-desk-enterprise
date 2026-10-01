import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/segmented";
import { mapApiError } from "@/lib/map-api-error";
import {
  highestSeverity,
  mapProblemError,
  problemSkipReasonKeys,
  problemStatusKeys,
  problemStatusTone,
  suggestProblemDraft,
} from "@/lib/problems/problem-view";
import { ticketPriorityLabelKey, ticketPriorityValues } from "@/lib/tickets/ticket-constants";
import { ticketText } from "@/lib/tickets/ticket-text";
import {
  createProblem,
  linkProblemTickets,
  listProblems,
  problemLinkableStatuses,
  problemQueryKeys,
  type ProblemSeverity,
  type ProblemTicketLinkResult,
} from "@/services/problems-api";

export type ProblemLinkTicket = {
  readonly id: string;
  readonly ticketNumber: string;
  readonly title: string;
  readonly priority: ProblemSeverity;
};

type Mode = "create" | "attach";

interface ProblemLinkDialogProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly tickets: readonly ProblemLinkTicket[];
  readonly initialMode?: Mode;
  /** Called after a successful create or attach. */
  readonly onDone: (outcome: { readonly problemId: string; readonly number: string; readonly result: ProblemTicketLinkResult | null }) => void;
}

const titleMax = 200;
const descriptionMax = 8000;

/**
 * Paket 3.3 (§8.1): "Create problem" from the selected tickets (or the open
 * ticket) and "Add to problem" (search among open problems). Skipped tickets
 * are listed with the reason before the dialog closes.
 */
export function ProblemLinkDialog({ open, onOpenChange, tickets, initialMode = "create", onDone }: ProblemLinkDialogProperties) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>(initialMode);
  const draft = useMemo(() => suggestProblemDraft(tickets, t("problems.link.descriptionIntro")), [tickets, t]);
  const [title, setTitle] = useState(draft.title);
  const [description, setDescription] = useState(draft.description);
  const [severity, setSeverity] = useState<ProblemSeverity>(() => highestSeverity(tickets.map((ticket) => ticket.priority)));
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ problemId: string; number: string; result: ProblemTicketLinkResult } | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(search.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [search]);

  const candidates = useQuery({
    queryKey: problemQueryKeys.search(debounced),
    queryFn: () => listProblems({ search: debounced || undefined, status: problemLinkableStatuses, limit: 10 }),
    enabled: open && mode === "attach",
    retry: false,
  });

  const ticketIds = tickets.map((ticket) => ticket.id);
  const canSubmit =
    !saving &&
    (mode === "create" ? title.trim().length >= 3 && description.trim().length > 0 : selectedProblemId !== null);

  const finish = (problemId: string, number: string, result: ProblemTicketLinkResult | null) => {
    if (result !== null && result.skipped.length > 0) {
      // Keep the dialog open so the agent sees which tickets were not linked.
      setOutcome({ problemId, number, result });
      return;
    }
    onOpenChange(false);
    onDone({ problemId, number, result });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      if (mode === "create") {
        const created = await createProblem({
          title: title.trim(),
          description: description.trim(),
          impact: severity,
          urgency: severity,
          ticketIds,
        });
        finish(created.id, created.number, created.ticketLinks);
      } else if (selectedProblemId !== null) {
        const chosen = candidates.data?.items.find((item) => item.id === selectedProblemId);
        const result = await linkProblemTickets(selectedProblemId, ticketIds);
        finish(selectedProblemId, chosen?.number ?? "", result);
      }
    } catch (caught) {
      setError(t(mapProblemError(caught) ?? mapApiError(caught)));
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (outcome !== null) onDone(outcome);
    onOpenChange(false);
  };

  return (
    <Modal open={open} onOpenChange={(next) => (saving ? undefined : next ? undefined : close())}>
      <ModalContent className="max-w-xl" data-testid="problem-link-dialog">
        <ModalHeader
          title={mode === "create" ? t("problems.link.createTitle") : t("problems.link.attachTitle")}
          description={t("problems.link.description", { count: tickets.length })}
        />
        {outcome !== null ? (
          <div className="grid gap-3" role="status">
            <p className="text-[12.5px] text-foreground">
              {t("problems.link.resultSummary", { count: outcome.result.linked.length, number: outcome.number })}
            </p>
            <div>
              <p className="mb-1 text-[12.5px] font-medium text-foreground">{t("problems.link.skippedTitle", { count: outcome.result.skipped.length })}</p>
              <ul className="grid gap-1 text-[12.5px]">
                {outcome.result.skipped.map((item) => (
                  <li key={item.ticketId} className="flex flex-wrap gap-x-2">
                    <span className="font-medium text-foreground">{item.ticketNumber ?? t("problems.link.unknownTicket")}</span>
                    <span className="text-muted-foreground">{t(problemSkipReasonKeys[item.reason])}</span>
                  </li>
                ))}
              </ul>
            </div>
            <ModalFooter>
              <Button type="button" onClick={close}>
                {t("ui.close")}
              </Button>
            </ModalFooter>
          </div>
        ) : (
          <form className="grid max-h-[70vh] gap-3 overflow-y-auto pr-1" onSubmit={(event) => void submit(event)}>
            <Segmented<Mode>
              size="sm"
              ariaLabel={t("problems.link.modeLabel")}
              value={mode}
              onChange={(next) => {
                setMode(next);
                setError(null);
              }}
              items={[
                { value: "create", label: t("problems.link.modeCreate") },
                { value: "attach", label: t("problems.link.modeAttach") },
              ]}
            />
            {mode === "create" ? (
              <>
                <Field label={t("problems.fields.title")} required>
                  <Input value={title} maxLength={titleMax} onChange={(event) => setTitle(event.target.value)} autoFocus />
                </Field>
                <Field label={t("problems.fields.description")} required>
                  <Textarea rows={5} value={description} maxLength={descriptionMax} onChange={(event) => setDescription(event.target.value)} />
                </Field>
                <Field label={t("problems.fields.priority")} hint={t("problems.link.priorityHint")}>
                  <Select value={severity} onChange={(event) => setSeverity(event.target.value as ProblemSeverity)}>
                    {ticketPriorityValues.map((value) => (
                      <option key={value} value={value}>
                        {ticketText(t, ticketPriorityLabelKey[value])}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            ) : (
              <div className="grid gap-2">
                <Field label={t("problems.link.searchLabel")} hint={t("problems.link.searchHint")}>
                  <Input value={search} maxLength={120} onChange={(event) => setSearch(event.target.value)} autoFocus />
                </Field>
                <div className="grid max-h-60 gap-1 overflow-y-auto rounded-md border border-border p-1.5" role="radiogroup" aria-label={t("problems.link.resultsLabel")}>
                  {candidates.isError ? (
                    <span className={`px-1.5 py-1 ${errorTextClassName}`}>{t(mapProblemError(candidates.error) ?? mapApiError(candidates.error))}</span>
                  ) : candidates.data === undefined ? (
                    <span className={`px-1.5 py-1 ${hintClassName}`}>{t("ui.loading")}</span>
                  ) : candidates.data.items.length === 0 ? (
                    <span className={`px-1.5 py-1 ${hintClassName}`}>{t("problems.link.noResults")}</span>
                  ) : (
                    candidates.data.items.map((item) => {
                      const checked = item.id === selectedProblemId;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="radio"
                          aria-checked={checked}
                          onClick={() => setSelectedProblemId(item.id)}
                          className={`flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            checked ? "bg-primary/10 text-foreground" : "text-foreground hover:bg-muted"
                          }`}
                        >
                          <span className="tnum shrink-0 font-medium">{item.number}</span>
                          <span className="min-w-0 flex-1 truncate">{item.title}</span>
                          <Badge tone={problemStatusTone(item.status)}>{t(problemStatusKeys[item.status])}</Badge>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
            {error !== null ? (
              <p role="alert" className={errorTextClassName}>
                {error}
              </p>
            ) : null}
            <ModalFooter>
              <Button type="button" variant="ghost" onClick={close} disabled={saving}>
                {t("ui.cancel")}
              </Button>
              <Button type="submit" disabled={!canSubmit} data-testid="problem-link-submit">
                {saving ? t("problems.link.saving") : mode === "create" ? t("problems.link.createSubmit") : t("problems.link.attachSubmit")}
              </Button>
            </ModalFooter>
          </form>
        )}
      </ModalContent>
    </Modal>
  );
}
