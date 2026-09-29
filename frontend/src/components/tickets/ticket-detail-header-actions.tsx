import { ChevronDown, Forward, GitMerge, Pencil, Split, UserCheck } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { announce } from "@/lib/a11y/announcer";
import { ariaKeyShortcuts, shortcutHint } from "@/lib/shortcuts/catalog";
import { useShortcut, useShortcutsRegistry } from "@/lib/shortcuts/shortcuts-context";
import { Button } from "@/components/ui/button";
import { TicketRequestRemoteButton } from "@/components/tickets/ticket-request-remote-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { canShowClaimAction, canShowReopenAction, nextTicketStatuses } from "@/lib/tickets/ticket-actions";
import { isResolveOrCloseStatus } from "@/lib/tickets/is-resolve-or-close-status";
import { ticketStatusLabelKey } from "@/lib/tickets/ticket-constants";
import { ticketText } from "@/lib/tickets/ticket-text";
import type { TicketResponse, TicketStatus, UpdateTicketInput } from "@/services/tickets-api";

interface TicketDetailHeaderActionsProperties {
  readonly ticket: TicketResponse;
  readonly canChangeStatus: boolean;
  readonly canClaim: boolean;
  readonly canRequestRemote: boolean;
  readonly claiming: boolean;
  readonly savingStatus: boolean;
  readonly reopening: boolean;
  readonly canSplit: boolean;
  readonly canForward: boolean;
  readonly canMerge?: boolean;
  readonly onMerge?: () => void;
  readonly onClaim: () => void;
  readonly onStatusChange: (status: TicketStatus, extras?: UpdateTicketInput) => void;
  readonly onReopen: () => void;
  readonly onSplit: () => void;
  readonly onForward: () => void;
  readonly onRequestClose: (status: TicketStatus) => void;
}

export function TicketDetailHeaderActions({
  ticket,
  canChangeStatus,
  canClaim,
  canRequestRemote,
  claiming,
  savingStatus,
  reopening,
  canSplit,
  canForward,
  canMerge = false,
  onMerge,
  onClaim,
  onStatusChange,
  onReopen,
  onSplit,
  onForward,
  onRequestClose,
}: TicketDetailHeaderActionsProperties) {
  const { t } = useTranslation();
  const nextStatuses = nextTicketStatuses(ticket.status);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const shortcuts = useShortcutsRegistry();
  const showsShortcut = shortcuts?.singleKeysEnabled === true;
  const withHint = (label: string, id: Parameters<typeof shortcutHint>[0]) =>
    showsShortcut ? `${label} (${shortcutHint(id)})` : undefined;
  const claimVisible = canShowClaimAction(ticket, canClaim);
  const statusVisible = canChangeStatus && nextStatuses.length > 0;

  // 2.8 §4.1: the shortcuts call the very same handlers as the buttons and are
  // bound only when the user holds the permission; a state that blocks the
  // action (closed ticket, already claimed) is announced instead of ignored.
  useShortcut(
    "claim",
    () => {
      if (!claimVisible) {
        announce(t("a11y.shortcuts.unavailable.claim"));
        return;
      }
      if (!claiming) onClaim();
    },
    canClaim,
  );
  useShortcut("forward", onForward, canForward);
  useShortcut(
    "status",
    () => {
      if (!statusVisible || savingStatus) {
        announce(t("a11y.shortcuts.unavailable.status"));
        return;
      }
      setStatusMenuOpen(true);
    },
    canChangeStatus,
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canShowClaimAction(ticket, canClaim) ? (
        <Button
          type="button"
          size="sm"
          disabled={claiming}
          onClick={onClaim}
          aria-keyshortcuts={showsShortcut ? ariaKeyShortcuts("claim") : undefined}
          title={withHint(t("tickets.claim"), "claim")}
        >
          <UserCheck size={14} />
          {claiming ? t("tickets.claiming") : t("tickets.claim")}
        </Button>
      ) : null}
      {canShowReopenAction(ticket) ? (
        <Button type="button" variant="outline" size="sm" disabled={reopening} onClick={onReopen}>
          {reopening
            ? t("tickets.detail.reopening")
            : ticket.reopen?.createsNewTicket
              ? t("tickets.detail.reopenAsNew")
              : t("tickets.detail.reopen")}
        </Button>
      ) : null}
      {canForward ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onForward}
          data-testid="ticket-forward"
          aria-keyshortcuts={showsShortcut ? ariaKeyShortcuts("forward") : undefined}
          title={withHint(t("tickets.forward.action"), "forward")}
        >
          <Forward size={14} /> {t("tickets.forward.action")}
        </Button>
      ) : null}
      {canSplit ? (
        <Button type="button" variant="outline" size="sm" onClick={onSplit}>
          <Split size={14} /> {t("tickets.split.action")}
        </Button>
      ) : null}
      {canMerge && onMerge ? (
        <Button type="button" variant="outline" size="sm" onClick={onMerge} data-testid="ticket-merge">
          <GitMerge size={14} /> {t("tickets.merge.action")}
        </Button>
      ) : null}
      {canRequestRemote ? <TicketRequestRemoteButton ticket={ticket} /> : null}
      {statusVisible ? (
        <DropdownMenu open={statusMenuOpen} onOpenChange={setStatusMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={savingStatus}
              aria-keyshortcuts={showsShortcut ? ariaKeyShortcuts("status") : undefined}
              title={withHint(t("tickets.detail.changeStatus"), "status")}
            >
              <Pencil size={14} />
              {savingStatus ? t("tickets.detail.saving") : t("tickets.detail.changeStatus")}
              <ChevronDown size={14} aria-hidden="true" className="opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {nextStatuses.map((status) => (
              <DropdownMenuItem
                key={status}
                onSelect={() => {
                  if (isResolveOrCloseStatus(status)) {
                    onRequestClose(status);
                    return;
                  }
                  onStatusChange(status);
                }}
              >
                {ticketText(t, ticketStatusLabelKey[status])}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
