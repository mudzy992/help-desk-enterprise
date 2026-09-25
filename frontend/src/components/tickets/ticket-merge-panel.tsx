import { useEffect, useState } from "react";
import { GitMerge, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { controlClassName, errorTextClassName, labelClassName, textareaClassName } from "@/components/ui/control";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { ticketStatusLabelKey } from "@/lib/tickets/ticket-constants";
import { ticketText } from "@/lib/tickets/ticket-text";
import { cn } from "@/lib/utils";
import type { TicketResponse, TicketStatus } from "@/services/tickets-api";
import { listMergeCandidates, mergeTicket, type MergeCandidate } from "@/services/tickets-merge-api";

const minimumReasonLength = 3;
const maximumReasonLength = 500;

interface TicketMergePanelProperties {
  readonly ticket: TicketResponse;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onComplete: (updated: TicketResponse) => void;
}

/**
 * Package 1.2 (M5): merge this ticket into another one. The search only offers
 * tickets that pass rule M1 and that the person handles as staff; the server
 * checks everything again on submit.
 */
export function TicketMergePanel({ ticket, open, onOpenChange, onComplete }: TicketMergePanelProperties) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<readonly MergeCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<MergeCandidate | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<TicketErrorKey | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery("");
    setCandidates([]);
    setSelected(null);
    setReason("");
    setErrorKey(null);
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setCandidates([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = window.setTimeout(() => {
      void listMergeCandidates(ticket.id, q)
        .then((items) => {
          if (!cancelled) {
            setCandidates(items);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setErrorKey(mapTicketError(error));
          }
        })
        .finally(() => {
          if (!cancelled) {
            setSearching(false);
          }
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [open, query, ticket.id]);

  const trimmed = reason.trim();
  const reasonValid = trimmed.length >= minimumReasonLength && trimmed.length <= maximumReasonLength;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col overflow-y-auto p-5" data-testid="ticket-merge-panel">
        <SheetTitle>{ticketText(t, "tickets.merge.title", { number: ticket.ticketNumber })}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {t("tickets.merge.hint")}
        </SheetDescription>
        <label className={`mt-4 ${labelClassName}`}>
          {t("tickets.merge.search")}
          <span className="relative block">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              className={cn(controlClassName, "pl-8")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("tickets.merge.searchPlaceholder")}
              data-testid="ticket-merge-search"
            />
          </span>
        </label>
        <ul className="mt-2 max-h-64 divide-y divide-border/50 overflow-y-auto rounded-md border border-border" aria-busy={searching}>
          {candidates.length === 0 ? (
            <li className="px-3 py-3 text-[12px] text-muted-foreground">
              {query.trim().length < 2
                ? t("tickets.merge.searchMin")
                : searching
                  ? t("tickets.merge.searching")
                  : t("tickets.merge.noResults")}
            </li>
          ) : (
            candidates.map((candidate) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  onClick={() => setSelected(candidate)}
                  aria-pressed={selected?.id === candidate.id}
                  data-testid="ticket-merge-candidate"
                  className={cn(
                    "w-full px-3 py-2 text-left text-[12.5px] transition-colors duration-150",
                    selected?.id === candidate.id ? "bg-primary/8" : "hover:bg-muted/60",
                  )}
                >
                  <span className="tnum font-medium text-link">{candidate.ticketNumber}</span>{" "}
                  <span className="text-foreground/90">{candidate.title}</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {statusLabel(t, candidate.status)}
                    {candidate.requesterName ? ` · ${candidate.requesterName}` : ""}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
        {selected ? (
          <div className="mt-3 rounded-md border border-primary/30 bg-primary/6 px-3 py-2 text-[12px]">
            <GitMerge size={12} className="mr-1 inline" aria-hidden="true" />
            {ticketText(t, "tickets.merge.preview", {
              child: ticket.ticketNumber,
              parent: selected.ticketNumber,
            })}
          </div>
        ) : null}
        <label className={`mt-4 ${labelClassName}`}>
          {t("tickets.merge.reason")}
          <textarea
            className={cn(textareaClassName, "min-h-16")}
            value={reason}
            maxLength={maximumReasonLength}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("tickets.merge.reasonPlaceholder")}
            data-testid="ticket-merge-reason"
          />
        </label>
        <p className="mt-2 text-[11.5px] text-muted-foreground">{t("tickets.merge.effects")}</p>
        {errorKey ? (
          <p className={`mt-2 ${errorTextClassName}`} role="alert">
            {ticketText(t, errorKey)}
          </p>
        ) : null}
        <div className="mt-4 flex gap-2 border-t border-border/70 pt-4">
          <Button
            type="button"
            size="sm"
            disabled={busy || selected === null || !reasonValid}
            data-testid="ticket-merge-confirm"
            onClick={() => {
              if (selected === null) {
                return;
              }
              setBusy(true);
              setErrorKey(null);
              void mergeTicket(ticket.id, { parentTicketId: selected.id, reason: trimmed })
                .then((updated) => {
                  onComplete(updated);
                  onOpenChange(false);
                })
                .catch((error) => setErrorKey(mapTicketError(error)))
                .finally(() => setBusy(false));
            }}
          >
            <GitMerge size={13} />
            {busy ? t("tickets.merge.merging") : t("tickets.merge.confirm")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("tickets.detail.cancelStatus")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function statusLabel(t: ReturnType<typeof useTranslation>["t"], status: string): string {
  const key = (ticketStatusLabelKey as Readonly<Record<TicketStatus, string>>)[status as TicketStatus];
  return key === undefined ? status : ticketText(t, key);
}
