import { CornerUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isTicketStaff } from "@/lib/session/route-access";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import {
  describeLastForward,
  forwardCountOf,
  isForwardPingPong,
  type TicketForwardFacts,
} from "@/lib/tickets/ticket-forwarding-display";
import { cn } from "@/lib/utils";

interface TicketForwardIndicatorProperties {
  readonly ticket: TicketForwardFacts;
  /** `chip` for the detail header (clickable), `inline` for list rows. */
  readonly variant?: "inline" | "chip";
  readonly onClick?: () => void;
}

/**
 * Package 1.6 (plan §3 D8/D9): "↪ 2" next to a forwarded ticket, amber from
 * three forwards. Staff only: the internal movement is not requester data.
 */
export function TicketForwardIndicator({ ticket, variant = "inline", onClick }: TicketForwardIndicatorProperties) {
  const { t, i18n } = useTranslation();
  const capabilities = useSessionCapabilities();
  const count = forwardCountOf(ticket);
  if (count === 0 || !isTicketStaff(capabilities)) {
    return null;
  }
  const warn = isForwardPingPong(ticket);
  const last = describeLastForward(ticket, i18n.language);
  const title = [
    t("tickets.forwarding.indicatorCount", { count }),
    last.when === null ? null : t("tickets.forwarding.indicatorWhen", { when: last.when }),
    last.from === null ? null : t("tickets.forwarding.indicatorFrom", { group: last.from }),
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
  const className = cn(
    "inline-flex shrink-0 items-center gap-0.5 font-medium tabular-nums",
    warn ? "text-warning" : "text-muted-foreground",
  );
  if (variant === "chip") {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        data-testid="ticket-forward-chip"
        className={cn(
          className,
          "rounded-full border px-2 py-0.5 text-[11.5px] hover:bg-surface-hover",
          warn ? "border-warning/50" : "border-border",
        )}
      >
        <CornerUpRight size={12} aria-hidden="true" />
        {t("tickets.forwarding.chip", { count })}
      </button>
    );
  }
  return (
    <span className={cn(className, "text-[11.5px]")} title={title} aria-label={title} data-testid="ticket-forward-indicator">
      <CornerUpRight size={12} aria-hidden="true" />
      {count}
    </span>
  );
}
