import { useCallback, useState } from "react";
import type { NavigateFunction } from "react-router-dom";
import type { ComposerSendOptions } from "@/components/tickets/ticket-message-composer";
import { isPlaybookGuardedTransition } from "@/lib/templates/use-ticket-playbook";
import { mapClaimError, mapTicketError } from "@/lib/tickets/map-ticket-error";
import type { useTicketPlaybook } from "@/lib/templates/use-ticket-playbook";
import type { useTicketDetail } from "@/lib/tickets/use-ticket-detail";
import type { TicketResponse } from "@/services/tickets-api";
import type { MessageType } from "@/services/tickets-collaboration-api";

type TicketDetailController = ReturnType<typeof useTicketDetail>;
type PlaybookController = ReturnType<typeof useTicketPlaybook>;
type StatusChange = Parameters<TicketDetailController["changeStatus"]>[0];
type StatusExtras = Parameters<TicketDetailController["changeStatus"]>[1];
type PlaybookWarning = {
  readonly status: StatusChange;
  readonly extras: StatusExtras;
  readonly steps: readonly string[];
};

type UseTicketDetailActionsInput = {
  readonly detail: TicketDetailController;
  readonly ticket: TicketResponse | null;
  readonly playbook: PlaybookController;
  readonly navigate: NavigateFunction;
  readonly mergedCount: number;
  readonly alsoToMerged: boolean;
};

export function useTicketDetailActions({
  detail,
  ticket,
  playbook,
  navigate,
  mergedCount,
  alsoToMerged,
}: UseTicketDetailActionsInput) {
  const [isSending, setIsSending] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [playbookWarning, setPlaybookWarning] = useState<PlaybookWarning | null>(null);

  const performStatusChange = useCallback(
    async (status: StatusChange, extras?: StatusExtras) => {
      setIsSavingStatus(true);
      try {
        await detail.changeStatus(status, extras);
      } catch (error) {
        detail.setActionError(mapTicketError(error));
      } finally {
        setIsSavingStatus(false);
      }
    },
    [detail],
  );

  const claim = useCallback(async () => {
    setIsClaiming(true);
    try {
      await detail.claim();
    } catch (error) {
      detail.setActionError(mapClaimError(error));
    } finally {
      setIsClaiming(false);
    }
  }, [detail]);

  const changeStatus = useCallback(
    (status: StatusChange, extras?: StatusExtras) => {
      if (ticket === null) return;
      const openSteps = playbook.view?.playbook?.progress.openRequired ?? [];
      if (
        playbook.view?.enabled === true &&
        playbook.view.mode === "warn" &&
        openSteps.length > 0 &&
        isPlaybookGuardedTransition(ticket.status, status)
      ) {
        setPlaybookWarning({ status, extras, steps: openSteps.map((step) => step.title) });
        return;
      }
      void performStatusChange(status, extras);
    },
    [performStatusChange, playbook.view, ticket],
  );

  const confirmPlaybookWarning = useCallback(() => {
    const pending = playbookWarning;
    setPlaybookWarning(null);
    if (pending === null) return;
    void performStatusChange(pending.status, pending.extras);
  }, [performStatusChange, playbookWarning]);

  const reopen = useCallback(async () => {
    if (ticket === null) return;
    setIsReopening(true);
    try {
      const updated = await detail.reopen();
      if (updated !== null && updated.id !== ticket.id) navigate(`/tickets/${updated.id}`);
    } catch (error) {
      detail.setActionError(mapTicketError(error));
    } finally {
      setIsReopening(false);
    }
  }, [detail, navigate, ticket]);

  const sendMessage = useCallback(
    async (type: MessageType, body: string, options?: ComposerSendOptions) => {
      if (ticket === null) return;
      setIsSending(true);
      try {
        await detail.sendMessage(type, body, {
          responseTemplateId: options?.responseTemplateId,
          alsoToMerged: type !== "INTERNAL_NOTE" && mergedCount > 0 && alsoToMerged,
        });
      } finally {
        setIsSending(false);
      }
    },
    [alsoToMerged, detail, mergedCount, ticket],
  );

  const waitForUser = useCallback(() => {
    void performStatusChange("WAITING_FOR_USER");
  }, [performStatusChange]);

  return {
    isSending,
    isClaiming,
    isSavingStatus,
    isReopening,
    playbookWarning,
    setPlaybookWarning,
    claim,
    changeStatus,
    confirmPlaybookWarning,
    reopen,
    sendMessage,
    waitForUser,
  };
}
