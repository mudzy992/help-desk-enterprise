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

export function useTicketComposerDraft(ticketId: string, access: ComposerAccess) {
  const canInternal = messageTypesForAccess(access).includes("INTERNAL_NOTE");
  const draftStorageKey = ticketComposerDraftStorageKey(ticketId);
  const [storedDraft] = useState(() => readSessionValue(draftStorageKey, isTicketComposerDraft));
  const canRestoreDraft = storedDraft?.mode !== "internal" || canInternal;
  const [internal, setInternal] = useState(
    () => canRestoreDraft && storedDraft?.mode === "internal",
  );
  const [body, setBody] = useState(() => (canRestoreDraft ? (storedDraft?.body ?? "") : ""));
  const bodyReference = useRef(body);
  bodyReference.current = body;
  const publicType = defaultMessageType(access);
  const type: MessageType = internal && canInternal ? "INTERNAL_NOTE" : publicType;

  useEffect(() => {
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
