import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { scopedTicketSetter } from "@/lib/tickets/scoped-ticket-setter";
import { createLatestRequestGuard } from "@/lib/async/latest-request-guard";
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
  type MessageType,
  type ParticipantRole,
  type TicketMessageResponse,
  type TicketParticipantResponse,
  type TicketTimeLogResponse,
} from "@/services/tickets-collaboration-api";
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
  const [attachmentsVisible, setAttachmentsVisible] = useState(false);
  const [timeVisible, setTimeVisible] = useState(false);
  const [canChangeStatus, setCanChangeStatus] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<TicketErrorKey | null>(null);
  const [actionError, setActionError] = useState<TicketErrorKey | null>(null);
  const requestGuard = useRef(createLatestRequestGuard());
  const accessDenied = useRef(false);
  const actionEpoch = useRef(0);
  const identity = useRef({ ticketId, currentUserId });
  if (identity.current.ticketId !== ticketId || identity.current.currentUserId !== currentUserId) {
    identity.current = { ticketId, currentUserId };
    actionEpoch.current += 1;
    requestGuard.current.cancel();
    // Reset in this render so a new identity never sees the previous ticket,
    // including the frame before the loading effect runs.
    setTicket(null);
    setMessages([]);
    setParticipants([]);
    setTimeLogs([]);
    setAttachments([]);
    setAttachmentsVisible(false);
    setTimeVisible(false);
    setIsLoading(true);
    setErrorKey(null);
    setActionError(null);
  }
  const onAccessDenied = useCallback(() => {
    accessDenied.current = true;
    actionEpoch.current += 1;
  }, []);
  const onAccessGranted = useCallback(() => {
    accessDenied.current = false;
  }, []);
  const canApplyRealtime = useCallback(() => !accessDenied.current, []);

  const detailTarget = useMemo(
    () => ({
      setTicket,
      setMessages,
      setParticipants,
      setTimeLogs,
      setAttachments,
      setAttachmentsVisible,
      setTimeVisible,
      setErrorKey,
      setActionError,
      setIsLoading,
    }),
    [
      setActionError,
      setAttachments,
      setAttachmentsVisible,
      setErrorKey,
      setIsLoading,
      setMessages,
      setParticipants,
      setTicket,
      setTimeLogs,
      setTimeVisible,
    ],
  );

  const load = useCallback(async () => {
    if (ticketId === undefined) {
      return;
    }
    const request = requestGuard.current.begin();
    await loadTicketDetail({
      ...detailTarget,
      ticketId,
      onAccessDenied,
      onAccessGranted,
      silent: false,
      isCurrent: () => requestGuard.current.isCurrent(request),
    });
  }, [detailTarget, onAccessDenied, onAccessGranted, ticketId]);

  const refresh = useCallback(async () => {
    if (ticketId === undefined) {
      return;
    }
    const request = requestGuard.current.begin();
    await loadTicketDetail({
      ...detailTarget,
      ticketId,
      onAccessDenied,
      onAccessGranted,
      silent: true,
      isCurrent: () => requestGuard.current.isCurrent(request),
    });
  }, [detailTarget, onAccessDenied, onAccessGranted, ticketId]);

  useEffect(() => {
    // Switching tickets must not leave a single field in place: the SLA panel,
    // badges and message list all read from this state, so a stale row would
    // show the previous ticket's data under the new ticket's number.
    accessDenied.current = false;
    setTicket(null);
    setMessages([]);
    setParticipants([]);
    setTimeLogs([]);
    setAttachments([]);
    setCanChangeStatus(true);
    setActionError(null);
    void load();
    const guard = requestGuard.current;
    return () => {
      guard.cancel();
      actionEpoch.current += 1;
    };
  }, [currentUserId, load]);

  const invalidateSnapshot = useCallback(() => requestGuard.current.cancel(), []);
  const onJoinFailure = useCallback(() => setActionError("tickets.errorGeneric"), []);
  const onAccessInvalidated = useCallback(() => {
    accessDenied.current = true;
    actionEpoch.current += 1;
    setTicket(null);
    setMessages([]);
    setParticipants([]);
    setTimeLogs([]);
    setAttachments([]);
    setAttachmentsVisible(false);
    setTimeVisible(false);
    setIsLoading(true);
  }, []);

  const realtimeReady = useTicketRealtime({
    ticketId,
    applyTicket: setTicket,
    setMessages,
    reload: refresh,
    invalidateSnapshot,
    onJoinFailure,
    canApplyRealtime,
    onAccessInvalidated,
  });

  const runAction = async (
    operation: (isCurrent: () => boolean) => Promise<void>,
    mapError: (error: unknown) => TicketErrorKey = mapTicketError,
  ) => {
    const epoch = actionEpoch.current;
    const isCurrent = () => epoch === actionEpoch.current && !accessDenied.current;
    if (!isCurrent()) return;
    setActionError(null);
    try {
      await operation(isCurrent);
    } catch (error) {
      if (!isCurrent()) return;
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
    realtimeReady,
    messages,
    participants,
    timeLogs,
    attachments,
    attachmentsVisible,
    timeVisible,
    canChangeStatus,
    isLoading,
    errorKey,
    actionError,
    setActionError,
    applyTicket: setTicket,
    setTimeLogs,
    reload: load,
    claim: () =>
      onTicket((id) =>
        runAction(async (isCurrent) => {
          const updated = await claimTicket(id);
          if (isCurrent()) setTicket(updated);
        }, mapClaimError),
      ),
    changeStatus: (
      status: TicketStatus,
      extras: { closeCode?: string; resolutionNote?: string } = {},
    ) =>
      onTicket((id) =>
        runAction(async (isCurrent) => {
          const updated = await updateTicket(id, { status, ...extras });
          if (isCurrent()) setTicket(updated);
        }),
      ),
    sendMessage: (
      type: MessageType,
      body: string,
      options?: { readonly alsoToMerged?: boolean; readonly responseTemplateId?: string },
    ) =>
      onTicket((id) => {
        const epoch = actionEpoch.current;
        if (accessDenied.current)
          return Promise.reject(new Error("Ticket access is being revalidated"));
        const isCurrent = () => actionEpoch.current === epoch && !accessDenied.current;
        return sendTicketMessageOptimistic({
          ticketId: id,
          type,
          body,
          alsoToMerged: options?.alsoToMerged,
          responseTemplateId: options?.responseTemplateId,
          authorUserId: currentUserId,
          setMessages: scopedTicketSetter(setMessages, isCurrent),
          setTicket: scopedTicketSetter(setTicket, isCurrent),
          setActionError: scopedTicketSetter(setActionError, isCurrent),
        });
      }),
    reopen: async () => {
      if (ticketId === undefined) {
        return null;
      }
      const epoch = actionEpoch.current;
      if (accessDenied.current) return null;
      setActionError(null);
      try {
        const updated = await reopenTicket(ticketId);
        if (epoch !== actionEpoch.current || accessDenied.current) return null;
        setTicket(updated);
        return updated;
      } catch (error) {
        if (epoch !== actionEpoch.current || accessDenied.current) return null;
        const mapped = mapTicketError(error);
        if (error instanceof ApiError && error.code === "STATUS_CHANGE_FORBIDDEN") {
          setCanChangeStatus(false);
        }
        setActionError(mapped);
        return null;
      }
    },
    addParticipant: (role: ParticipantRole, userId: string) =>
      onTicket((id) =>
        runAction(async (isCurrent) => {
          const created = await addTicketParticipant(id, { role, userId });
          if (isCurrent()) setParticipants((current) => [...current, created]);
        }),
      ),
    removeParticipant: (participantId: string) =>
      onTicket((id) =>
        runAction(async (isCurrent) => {
          await removeTicketParticipant(id, participantId);
          if (isCurrent())
            setParticipants((current) => current.filter((item) => item.id !== participantId));
        }),
      ),
    upload: (file: File) =>
      onTicket((id) =>
        runAction(async (isCurrent) => {
          const created = await uploadTicketAttachment(id, file);
          if (isCurrent()) setAttachments((current) => [...current, created]);
        }),
      ),
    download: (attachment: TicketAttachmentResponse) =>
      onTicket((id) => downloadAttachmentFile(id, attachment)),
    removeAttachment: (attachmentId: string) =>
      onTicket((id) =>
        runAction(async (isCurrent) => {
          await deleteTicketAttachment(id, attachmentId);
          if (isCurrent())
            setAttachments((current) => current.filter((item) => item.id !== attachmentId));
        }),
      ),
  };
}
