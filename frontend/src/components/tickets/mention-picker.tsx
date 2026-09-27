import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { listMentionCandidates, type MentionCandidate } from "@/services/tickets-agent-collaboration-api";

interface MentionPickerProperties {
  readonly ticketId: string;
  readonly query: string;
  readonly activeIndex: number;
  readonly onCandidates: (candidates: readonly MentionCandidate[]) => void;
  readonly onPick: (candidate: MentionCandidate) => void;
}

/**
 * Paket 2.4 (B1): colleagues who can see the ticket, filtered by what follows `@`.
 * Keyboard handling (arrows / Enter / Esc) lives in the composer's textarea.
 */
export function MentionPicker({ ticketId, query, activeIndex, onCandidates, onPick }: MentionPickerProperties) {
  const { t } = useTranslation();
  const [candidates, setCandidates] = useState<readonly MentionCandidate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const handle = window.setTimeout(() => {
      listMentionCandidates(ticketId, query)
        .then((next) => {
          if (!active) return;
          setCandidates(next);
          onCandidates(next);
        })
        .catch(() => {
          if (!active) return;
          setCandidates([]);
          onCandidates([]);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
    // onCandidates is a stable setter from the composer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId, query]);

  return (
    <div
      role="listbox"
      aria-label={t("tickets.collaboration.mentions.pickerLabel")}
      className="absolute bottom-full left-3 z-20 mb-1 w-72 overflow-hidden rounded-md border border-border bg-elevated shadow-lg"
      data-testid="mention-picker"
    >
      {candidates.length === 0 ? (
        <div className="px-3 py-2 text-[12px] text-muted-foreground">
          {loading ? t("tickets.collaboration.mentions.loading") : t("tickets.collaboration.mentions.empty")}
        </div>
      ) : (
        candidates.map((candidate, index) => (
          <button
            key={candidate.id}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            onMouseDown={(event) => {
              // Keep focus in the textarea.
              event.preventDefault();
              onPick(candidate);
            }}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-surface-hover",
              index === activeIndex && "bg-surface-hover",
            )}
          >
            <Avatar name={candidate.displayName} size="xs" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{candidate.displayName}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{candidate.email}</span>
            </span>
          </button>
        ))
      )}
      <div className="border-t border-border/60 px-3 py-1 text-[10.5px] text-muted-foreground/80">
        {t("tickets.collaboration.mentions.hint")}
      </div>
    </div>
  );
}
