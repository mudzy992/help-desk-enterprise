import { useTranslation } from "react-i18next";
import { TicketPriorityBadge } from "@/components/tickets/ticket-badges";
import { cn } from "@/lib/utils";
import { ticketSeverityLabelKey } from "@/lib/tickets/ticket-constants";
import { ticketText } from "@/lib/tickets/ticket-text";
import type { TicketImpact, TicketPriority } from "@/services/tickets-api";

const levels: readonly TicketImpact[] = ["LOW", "MEDIUM", "HIGH"];

interface CreateTicketSeverityFieldsProperties {
  readonly impact: TicketImpact;
  readonly urgency: TicketImpact;
  readonly suggestedPriority: TicketPriority;
  readonly onImpactChange: (value: TicketImpact) => void;
  readonly onUrgencyChange: (value: TicketImpact) => void;
}

export function CreateTicketSeverityFields({
  impact,
  urgency,
  suggestedPriority,
  onImpactChange,
  onUrgencyChange,
}: CreateTicketSeverityFieldsProperties) {
  const { t } = useTranslation();
  return (
    <div className="mt-5 grid grid-cols-1 gap-4 border-t border-border/60 pt-4 md:grid-cols-2">
      {(
        [
          [t("tickets.impactLabel"), impact, onImpactChange],
          [t("tickets.urgencyLabel"), urgency, onUrgencyChange],
        ] as const
      ).map(([label, value, onChange]) => (
        <div key={label}>
          <p className="mb-1.5 text-[12.5px] font-medium text-foreground">{label}</p>
          <div className="flex rounded-md border border-border bg-background/50 p-0.5">
            {levels.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => onChange(level)}
                className={cn(
                  "flex-1 rounded-[5px] border py-1.5 text-[11.5px] font-medium transition-colors duration-150",
                  value === level
                    ? "border-border bg-elevated text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {ticketText(t, ticketSeverityLabelKey[level])}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground md:col-span-2">
        <span>{t("tickets.calculatedPriority")}</span>
        <TicketPriorityBadge priority={suggestedPriority} />
      </div>
    </div>
  );
}
