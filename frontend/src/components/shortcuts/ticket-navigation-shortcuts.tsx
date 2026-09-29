import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { announce } from "@/lib/a11y/announcer";
import { useShortcut } from "@/lib/shortcuts/shortcuts-context";
import { adjacentTicket, readTicketListContext } from "@/lib/shortcuts/ticket-list-context";

interface TicketNavigationShortcutsProperties {
  readonly ticketId: string;
  /** `]` / `[` are for staff working a queue (2.8 §4.1). */
  readonly isStaff: boolean;
}

/** Paket 2.8 §4.1: next / previous ticket from the last list, and back to the list. */
export function TicketNavigationShortcuts({ ticketId, isStaff }: TicketNavigationShortcutsProperties) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const go = (direction: 1 | -1) => {
    const result = adjacentTicket(readTicketListContext(), ticketId, direction);
    if (result.kind === "ticket") {
      navigate(`/tickets/${result.id}`);
      return;
    }
    announce(
      result.kind === "edge"
        ? t(direction === 1 ? "a11y.shortcuts.endOfList" : "a11y.shortcuts.startOfList")
        : t("a11y.shortcuts.noListContext"),
    );
  };

  useShortcut("nextTicket", () => go(1), isStaff);
  useShortcut("previousTicket", () => go(-1), isStaff);
  useShortcut("backToList", () => navigate(readTicketListContext()?.listUrl ?? "/tickets"));
  return null;
}
