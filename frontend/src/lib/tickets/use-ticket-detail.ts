import { useCallback, useEffect, useState } from "react";
import { mapClaimError, mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { loadTicketDetail } from "@/lib/tickets/load-ticket-detail";
import { sendTicketMessageOptimistic } from "@/lib/tickets/send-ticket-message-optimistic";
import { useTicketRealtime } from "@/lib/tickets/use-ticket-realtime";
import { useSession } from "@/lib/session/use-session";
import { ApiError } from "@/services/api";
import { downloadAttachmentFile } from "@/lib/tickets/download-attachment";
import {
  deleteTicketAttachment,
  uploadTicketAttachment,
  type TicketAttachmentResponse,
} from "@/services/tickets-attachments-api";
import {
  addTicketParticipant,
  removeTicketParticipant,
  startTicketTimeLog,
  stopTicketTimeLog,
  type MessageType,
  type ParticipantRole,
  type TicketMessageResponse,
  type TicketParticipantResponse,
  type TicketTimeLogResponse,
} from "@/services/tickets-collaboration-api";
import { assignTicketUser } from "@/services/tickets-bulk-api";
import {
  claimTicket,
  reopenTicket,
  updateTicket,
  type TicketResponse,
  type TicketStatus,
} from "@/services/tickets-api";

export function useTicketDetail(ticketId: string | undefined) {
  const { currentUserId } = useSession();
  const [ticket, setTicket] = useState<TicketResponse | null>(null);
  const [messages, setMessages] = useState<readonly TicketMessageResponse[]>([]);
  const [participants, setParticipants] = useState<readonly TicketParticipantResponse[]>([]);
  const [timeLogs, setTimeLogs] = useState<readonly TicketTimeLogResponse[]>([]);
  const [attachments, setAttachments] = useState<readonly TicketAttachmentResponse[]>([]);
  const [inboxAccessible, setInboxAccessible] = useState(false);
  const [attachmentsVisible, setAttachmentsVisible] = useState(false);
  const [timeVisible, setTimeVisible] = useState(false);
  const [canChangeStatus, setCanChangeStatus] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<TicketErrorKey | null>(null);
  const [actionError, setActionError] = useState<TicketErrorKey | null>(null);

  const detailTarget = {
    setTicket,
    setMessages,
    setParticipants,
    setTimeLogs,
    setAttachments,
    setInboxAccessible,
    setAttachmentsVisible,
    setTimeVisible,
    setErrorKey,
    setIsLoading,
  };

  const load = useCallback(async () => {
    if (ticketId === undefined) {
      return;
    }
    await loadTicketDetail({ ...detailTarget, ticketId, silent: false });
  }, [ticketId]);

  const refresh = useCallback(async () => {
    if (ticketId === undefined) {
      return;
    }
    await loadTicketDetail({ ...detailTarget, ticketId, silent: true });
  }, [ticketId]);

  useEffect(() => {
    // Switching tickets must not leave a single field in place: the SLA panel,
    // badges and message list all read from this state, so a stale row would
    // show the previous ticket's data under the new ticket's number.
    setTicket(null);
    setMessages([]);
    setParticipants([]);
    setTimeLogs([]);
    setAttachments([]);
    setCanChangeStatus(true);
    setActionError(null);
    void load();
  }, [load]);

  useTicketRealtime({
    ticketId,
    applyTicket: setTicket,
    setMessages,
    reload: refresh,
  });

  const runAction = async (
    operation: () => Promise<void>,
    mapError: (error: unknown) => TicketErrorKey = mapTicketError,
  ) => {
    setActionError(null);
    try {
      await operation();
    } catch (error) {
      const mapped = mapError(error);
      if (error instanceof ApiError && error.code === "STATUS_CHANGE_FORBIDDEN") {
        setCanChangeStatus(false);
      }
      setActionError(mapped);
    }
  };

  const onTicket = async (run: (id: string) => Promise<void>) => {
    if (ticketId === undefined) {
      return;
    }
    await run(ticketId);
  };

  return {
    ticket,
    messages,
    participants,
    timeLogs,
    attachments,
    inboxAccessible,
    attachmentsVisible,
    timeVisible,
    canChangeStatus,
    isLoading,
    errorKey,
    actionError,
    setActionError,
    applyTicket: setTicket,
    reload: load,
    claim: () => onTicket((id) => runAction(async () => {
      setTicket(await claimTicket(id));
    }, mapClaimError)),
    assignUser: (userId: string) => onTicket((id) => runAction(async () => {
      const updated = await assignTicketUser(id, userId);
      if (updated !== undefined) {
        setTicket(updated);
      }
      await loadTicketDetail({ ...detailTarget, ticketId: id, silent: true });
    })),
    changeStatus: (status: TicketStatus, extras: { closeCode?: string; resolutionNote?: string } = {}) =>
      onTicket((id) => runAction(async () => {
        setTicket(await updateTicket(id, { status, ...extras }));
      })),
    sendMessage: (type: MessageType, body: string) =>
      onTicket((id) => sendTicketMessageOptimistic({
        ticketId: id,
        type,
        body,
        authorUserId: currentUserId,
        setMessages,
        setTicket,
        setActionError,
      })),
    reopen: async () => {
      if (ticketId === undefined) {
        return null;
      }
      setActionError(null);
      try {
        const updated = await reopenTicket(ticketId);
        setTicket(updated);
        return updated;
      } catch (error) {
        const mapped = mapTicketError(error);
        if (error instanceof ApiError && error.code === "STATUS_CHANGE_FORBIDDEN") {
          setCanChangeStatus(false);
        }
        setActionError(mapped);
        return null;
      }
    },
    addParticipant: (role: ParticipantRole, userId: string) =>
      onTicket((id) => runAction(async () => {
        const created = await addTicketParticipant(id, { role, userId });
        setParticipants((current) => [...current, created]);
      })),
    removeParticipant: (participantId: string) =>
      onTicket((id) => runAction(async () => {
        await removeTicketParticipant(id, participantId);
        setParticipants((current) => current.filter((item) => item.id !== participantId));
      })),
    startTimer: () => onTicket((id) => runAction(async () => {
      const created = await startTicketTimeLog(id);
      setTimeLogs((current) => [...current, created]);
    })),
    stopTimer: (timeLogId: string) => onTicket((id) => runAction(async () => {
      const stopped = await stopTicketTimeLog(id, timeLogId);
      setTimeLogs((current) => current.map((item) => (item.id === timeLogId ? stopped : item)));
    })),
    upload: (file: File) => onTicket((id) => runAction(async () => {
      const created = await uploadTicketAttachment(id, file);
      setAttachments((current) => [...current, created]);
    })),
    download: (attachment: TicketAttachmentResponse) =>
      onTicket((id) => downloadAttachmentFile(id, attachment)),
    removeAttachment: (attachmentId: string) =>
      onTicket((id) => runAction(async () => {
        await deleteTicketAttachment(id, attachmentId);
        setAttachments((current) => current.filter((item) => item.id !== attachmentId));
      })),
  };
}
