import { useEffect, useRef, useState } from "react";
import {
  defaultMessageType,
  messageTypesForAccess,
  type ComposerAccess,
} from "@/lib/tickets/message-composer-access";
import {
  clearSessionValue,
  isTicketComposerDraft,
  readSessionValue,
  ticketComposerDraftStorageKey,
  writeSessionValue,
} from "@/lib/tickets/ticket-draft-storage";
import type { MessageType } from "@/services/tickets-collaboration-api";
import { useSession } from "@/lib/session/use-session";

export function useTicketComposerDraft(ticketId: string, access: ComposerAccess) {
  const { currentUserId } = useSession();
  const canInternal = messageTypesForAccess(access).includes("INTERNAL_NOTE");
  const draftStorageKey =
    currentUserId === null ? null : ticketComposerDraftStorageKey(currentUserId, ticketId);
  const readDraft = () =>
    draftStorageKey === null ? null : readSessionValue(draftStorageKey, isTicketComposerDraft);
  const [loadedStorageKey, setLoadedStorageKey] = useState(draftStorageKey);
  const [storedDraft, setStoredDraft] = useState(readDraft);
  const canRestoreDraft = storedDraft?.mode !== "internal" || canInternal;
  const [internal, setInternal] = useState(
    () => canRestoreDraft && storedDraft?.mode === "internal",
  );
  const [body, setBody] = useState(() => (canRestoreDraft ? (storedDraft?.body ?? "") : ""));
  if (loadedStorageKey !== draftStorageKey) {
    const nextDraft = readDraft();
    const canRestoreNext = nextDraft?.mode !== "internal" || canInternal;
    setLoadedStorageKey(draftStorageKey);
    setStoredDraft(nextDraft);
    setInternal(canRestoreNext && nextDraft?.mode === "internal");
    setBody(canRestoreNext ? (nextDraft?.body ?? "") : "");
  }
  const bodyReference = useRef(body);
  bodyReference.current = body;
  const publicType = defaultMessageType(access);
  const type: MessageType = internal && canInternal ? "INTERNAL_NOTE" : publicType;

  useEffect(() => {
    if (draftStorageKey === null) return;
    if (!canRestoreDraft || body.trim().length === 0) {
      clearSessionValue(draftStorageKey);
      return;
    }
    writeSessionValue(draftStorageKey, {
      body,
      mode: internal && canInternal ? "internal" : "reply",
    });
  }, [body, canInternal, canRestoreDraft, draftStorageKey, internal]);

  return {
    canInternal,
    canRestoreDraft,
    internal,
    setInternal,
    body,
    setBody,
    bodyReference,
    type,
    draftStorageKey,
  };
}
