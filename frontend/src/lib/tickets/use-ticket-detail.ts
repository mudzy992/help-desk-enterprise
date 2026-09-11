import { useCallback, useEffect, useState } from "react";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { ApiError } from "@/services/api";
import { downloadAttachmentFile } from "@/lib/tickets/download-attachment";
import {
  deleteTicketAttachment,
  listTicketAttachments,
  uploadTicketAttachment,
  type TicketAttachmentResponse,
} from "@/services/tickets-attachments-api";
import {
  addTicketParticipant,
  createTicketMessage,
  listTicketMessages,
  listTicketParticipants,
  listTicketTimeLogs,
  removeTicketParticipant,
  startTicketTimeLog,
  stopTicketTimeLog,
  type MessageType,
  type ParticipantRole,
  type TicketMessageResponse,
  type TicketParticipantResponse,
  type TicketTimeLogResponse,
} from "@/services/tickets-collaboration-api";
import {
  claimTicket,
  getTicket,
  listGroupInbox,
  reopenTicket,
  updateTicket,
  type TicketResponse,
  type TicketStatus,
} from "@/services/tickets-api";

export function useTicketDetail(ticketId: string | undefined) {
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

  const load = useCallback(async () => {
    if (ticketId === undefined) {
      return;
    }
    setIsLoading(true);
    setErrorKey(null);
    try {
      const loaded = await getTicket(ticketId);
      setTicket(loaded);
      const [messageRows, participantRows] = await Promise.all([
        listTicketMessages(ticketId),
        listTicketParticipants(ticketId),
      ]);
      setMessages(messageRows);
      setParticipants(participantRows);
      await listGroupInbox()
        .then(() => setInboxAccessible(true))
        .catch(() => setInboxAccessible(false));
      await listTicketTimeLogs(ticketId)
        .then((rows) => {
          setTimeLogs(rows);
          setTimeVisible(true);
        })
        .catch(() => setTimeVisible(false));
      await listTicketAttachments(ticketId)
        .then((rows) => {
          setAttachments(rows);
          setAttachmentsVisible(true);
        })
        .catch(() => setAttachmentsVisible(false));
    } catch (error) {
      setTicket(null);
      setErrorKey(mapTicketError(error));
    } finally {
      setIsLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = async (operation: () => Promise<void>) => {
    setActionError(null);
    try {
      await operation();
    } catch (error) {
      const mapped = mapTicketError(error);
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
    })),
    changeStatus: (status: TicketStatus, extras: { closeCode?: string; resolutionNote?: string } = {}) =>
      onTicket((id) => runAction(async () => {
        setTicket(await updateTicket(id, { status, ...extras }));
      })),
    sendMessage: (type: MessageType, body: string) =>
      onTicket((id) => runAction(async () => {
        const created = await createTicketMessage(id, { type, body });
        setMessages((current) => [...current, created]);
        setTicket(await getTicket(id));
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
