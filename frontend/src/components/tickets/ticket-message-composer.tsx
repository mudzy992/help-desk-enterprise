import type { ReactNode } from "react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { BookmarkPlus, FileText, MessageSquareLock, Paperclip, Send, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useShortcut } from "@/lib/shortcuts/shortcuts-context";
import { TICKET_CONVERSATION_ID } from "@/components/tickets/ticket-conversation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MentionPicker } from "@/components/tickets/mention-picker";
import { detectMentionQuery, insertMentionToken, type MentionQuery } from "@/lib/tickets/mention-tokens";
import type { MentionCandidate } from "@/services/tickets-agent-collaboration-api";
import { Segmented, type SegmentedItem } from "@/components/ui/segmented";
import { errorTextClassName, textareaClassName } from "@/components/ui/control";
import { cn } from "@/lib/utils";
import { SaveAsTemplateDialog } from "@/components/templates/save-as-template-dialog";
import { TemplatePicker, type InsertedTemplate } from "@/components/templates/template-picker";
import { insertAtCursor, isSlashTrigger } from "@/lib/templates/insert-at-cursor";
import { mapTemplatesError } from "@/lib/templates/map-templates-error";
import { renderTicketTemplate } from "@/services/templates-api";
import {
  defaultMessageType,
  messageTypesForAccess,
  type ComposerAccess,
} from "@/lib/tickets/message-composer-access";
import type { TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { ticketText } from "@/lib/tickets/ticket-text";
import type { MessageType } from "@/services/tickets-collaboration-api";

type ComposerMode = "reply" | "internal";

/** Package 1.4 (T4). */
export type ComposerSendOptions = { readonly responseTemplateId?: string };

export type ComposerTemplatesOptions = {
  readonly ticketId: string;
  readonly canSavePersonal: boolean;
  /** A playbook step asked to insert its template (P1); `nonce` makes repeats fire. */
  readonly insertRequest?: { readonly templateId: string; readonly name: string; readonly nonce: number } | null;
};

/** Paket 2.4: presence, @mentions and the collision confirmation. */
export type ComposerCollaborationOptions = {
  readonly ticketId: string;
  readonly mentionsEnabled: boolean;
  /** Called on every edit with the channel being typed in (null = cleared). */
  readonly onTyping: (channel: "public" | "internal" | null) => void;
  /** A4: reason to confirm before a public send (translated), or null. */
  readonly confirmBeforePublicSend: () => string | null;
};

interface TicketMessageComposerProperties {
  readonly access: ComposerAccess;
  readonly isSending: boolean;
  readonly sendErrorKey?: TicketErrorKey | null;
  readonly canWaitForUser?: boolean;
  readonly onSend: (type: MessageType, body: string, options?: ComposerSendOptions) => Promise<void>;
  readonly onWaitForUser?: () => void;
  readonly onUpload?: (file: File) => Promise<void>;
  /** Package 1.2: extra control shown only for public replies ("also to merged"). */
  readonly publicExtra?: ReactNode;
  /** Package 1.4 (T5/T6): template picker; omitted for requesters. */
  readonly templates?: ComposerTemplatesOptions;
  readonly collaboration?: ComposerCollaborationOptions;
}

export function TicketMessageComposer({
  access,
  isSending,
  sendErrorKey = null,
  canWaitForUser = false,
  onSend,
  onWaitForUser,
  onUpload,
  publicExtra,
  templates,
  collaboration,
}: TicketMessageComposerProperties) {
  const { t } = useTranslation();
  const types = messageTypesForAccess(access);
  const canInternal = types.includes("INTERNAL_NOTE");
  const [internal, setInternal] = useState(false);
  const [body, setBody] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputReference = useRef<HTMLInputElement>(null);
  const textareaReference = useRef<HTMLTextAreaElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [usedTemplate, setUsedTemplate] = useState<{ readonly id: string; readonly name: string } | null>(null);
  const selectionReference = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const publicType = defaultMessageType(access);
  const type: MessageType = internal && canInternal ? "INTERNAL_NOTE" : publicType;

  const composerModes: readonly SegmentedItem<ComposerMode>[] = canInternal
    ? [
        { value: "reply", label: t("tickets.detail.publicReply"), icon: <Send size={12.5} /> },
        {
          value: "internal",
          label: t("tickets.detail.internalNote"),
          icon: <MessageSquareLock size={12.5} />,
        },
      ]
    : [{ value: "reply", label: t("tickets.detail.publicReply"), icon: <Send size={12.5} /> }];

  // 2.8 §4.1: R / I put the caret into the editor in the chosen mode.
  const focusEditor = (asInternal: boolean) => {
    setInternal(asInternal && canInternal);
    setMention(null);
    window.requestAnimationFrame(() => textareaReference.current?.focus());
  };
  useShortcut("reply", () => focusEditor(false));
  useShortcut("internalNote", () => focusEditor(true), canInternal);
  useShortcut("send", null);
  useShortcut("leaveEditor", null);

  const [mention, setMention] = useState<MentionQuery | null>(null);
  const [mentionCandidates, setMentionCandidates] = useState<readonly MentionCandidate[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [confirmReason, setConfirmReason] = useState<string | null>(null);
  const mentionsActive = collaboration?.mentionsEnabled === true && type === "INTERNAL_NOTE";

  const updateMention = (value: string, caret: number) => {
    if (!mentionsActive) {
      setMention(null);
      return;
    }
    const next = detectMentionQuery(value, caret);
    setMention(next);
    if (next === null || next.query !== mention?.query) setMentionIndex(0);
  };

  const pickMention = (candidate: MentionCandidate) => {
    const area = textareaReference.current;
    if (mention === null || area === null) return;
    const next = insertMentionToken(body, mention, area.selectionStart, candidate);
    setBody(next.value);
    setMention(null);
    window.requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(next.caret, next.caret);
    });
  };

  const send = async () => {
    await onSend(type, body.trim(), usedTemplate === null ? undefined : { responseTemplateId: usedTemplate.id });
    setBody("");
    setUsedTemplate(null);
    setMention(null);
    collaboration?.onTyping(null);
  };

  /** Resolves false when the send waits for the collision confirmation. */
  const submit = async (): Promise<boolean> => {
    if (body.trim().length === 0) {
      return true;
    }
    if (collaboration !== undefined && type !== "INTERNAL_NOTE") {
      const reason = collaboration.confirmBeforePublicSend();
      if (reason !== null) {
        setConfirmReason(reason);
        return false;
      }
    }
    await send();
    return true;
  };

  const openPicker = useCallback(() => {
    const area = textareaReference.current;
    if (area !== null) {
      selectionReference.current = { start: area.selectionStart, end: area.selectionEnd };
    }
    setPickerOpen(true);
  }, []);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    textareaReference.current?.focus();
  }, []);

  const [insertErrorKey, setInsertErrorKey] = useState<ReturnType<typeof mapTemplatesError> | null>(null);
  const insertNonce = templates?.insertRequest?.nonce;
  useEffect(() => {
    const request = templates?.insertRequest;
    if (templates === undefined || request === undefined || request === null) return;
    let active = true;
    const area = textareaReference.current;
    selectionReference.current = area === null
      ? { start: body.length, end: body.length }
      : { start: area.selectionStart, end: area.selectionEnd };
    renderTicketTemplate(templates.ticketId, request.templateId)
      .then((rendered) => {
        if (!active) return;
        setInsertErrorKey(null);
        onTemplateInserted({ templateId: request.templateId, name: request.name, rendered });
      })
      .catch((error: unknown) => {
        if (active) setInsertErrorKey(mapTemplatesError(error));
      });
    return () => {
      active = false;
    };
    // Fires once per request (nonce), not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertNonce]);

  const onTemplateInserted = (inserted: InsertedTemplate) => {
    const { start, end } = selectionReference.current;
    const next = insertAtCursor(body, start, end, inserted.rendered.text);
    setBody(next.value);
    setUsedTemplate({ id: inserted.templateId, name: inserted.name });
    setPickerOpen(false);
    window.requestAnimationFrame(() => {
      const area = textareaReference.current;
      if (area !== null) {
        area.focus();
        area.setSelectionRange(next.caret, next.caret);
      }
    });
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await submit();
    } catch {
      return;
    }
  };

  return (
    <Card className="mt-4">
      <form onSubmit={(event) => void onSubmit(event)}>
        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2">
          <Segmented<ComposerMode>
            size="sm"
            ariaLabel={t("a11y.conversation.composerMode")}
            value={internal && canInternal ? "internal" : "reply"}
            onChange={(next) => {
              setInternal(next === "internal");
              setMention(null);
            }}
            items={composerModes}
          />
          <span className="ml-auto text-[11px] text-muted-foreground">
            {internal ? t("tickets.detail.internalHint") : t("tickets.detail.publicHint")}
          </span>
        </div>
        <div className="relative p-3">
          {templates && pickerOpen ? (
            <TemplatePicker
              ticketId={templates.ticketId}
              kind={type === "INTERNAL_NOTE" ? "INTERNAL" : "REPLY"}
              onClose={closePicker}
              onInsert={onTemplateInserted}
            />
          ) : null}
          {collaboration !== undefined && mentionsActive && mention !== null ? (
            <MentionPicker
              ticketId={collaboration.ticketId}
              query={mention.query}
              activeIndex={mentionIndex}
              onCandidates={setMentionCandidates}
              onPick={pickMention}
            />
          ) : null}
          <textarea
            ref={textareaReference}
            value={body}
            data-testid="ticket-composer-body"
            aria-label={internal && canInternal ? t("tickets.detail.internalNote") : t("tickets.detail.publicReply")}
            onChange={(event) => {
              setBody(event.target.value);
              if (event.target.value.trim().length === 0) setUsedTemplate(null);
              updateMention(event.target.value, event.target.selectionStart);
              collaboration?.onTyping(
                event.target.value.trim().length === 0 ? null : type === "INTERNAL_NOTE" ? "internal" : "public",
              );
            }}
            onBlur={() => setMention(null)}
            onKeyDown={(event) => {
              if (mention !== null && mentionsActive) {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setMention(null);
                  return;
                }
                if (mentionCandidates.length > 0) {
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    const step = event.key === "ArrowDown" ? 1 : -1;
                    setMentionIndex((current) => (current + step + mentionCandidates.length) % mentionCandidates.length);
                    return;
                  }
                  if ((event.key === "Enter" || event.key === "Tab") && !event.ctrlKey && !event.metaKey) {
                    event.preventDefault();
                    const candidate = mentionCandidates[Math.min(mentionIndex, mentionCandidates.length - 1)];
                    if (candidate !== undefined) pickMention(candidate);
                    return;
                  }
                }
              }
              if (templates) {
                const shortcut = event.key.toLowerCase() === "t" && event.shiftKey && (event.ctrlKey || event.metaKey);
                const slash =
                  event.key === "/" &&
                  !event.ctrlKey &&
                  !event.metaKey &&
                  !event.altKey &&
                  isSlashTrigger(body, event.currentTarget.selectionStart, event.currentTarget.selectionEnd);
                if (shortcut || slash) {
                  event.preventDefault();
                  openPicker();
                  return;
                }
              }
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void submit().catch(() => undefined);
                return;
              }
              // 2.8 §4.1: Esc leaves the editor (the text stays) and returns to the conversation.
              if (event.key === "Escape" && !pickerOpen) {
                event.preventDefault();
                const log = document.getElementById(TICKET_CONVERSATION_ID);
                if (log !== null) log.focus();
                else event.currentTarget.blur();
              }
            }}
            placeholder={
              internal ? t("tickets.detail.composeInternal") : t("tickets.detail.composePublic")
            }
            className={cn(textareaClassName, "min-h-20 resize-y")}
            disabled={isSending}
          />
          {insertErrorKey !== null ? (
            <p role="alert" className={`mt-2 ${errorTextClassName}`}>
              {t(insertErrorKey)}
            </p>
          ) : null}
          {usedTemplate !== null ? (
            <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated/60 px-2 py-0.5 text-[11.5px] text-muted-foreground" data-testid="composer-used-template">
              <FileText size={11} />
              {t("templates.picker.usedTemplate", { name: usedTemplate.name })}
              <button
                type="button"
                onClick={() => setUsedTemplate(null)}
                aria-label={t("templates.picker.clearTemplate")}
                className="rounded p-0.5 hover:bg-surface-hover hover:text-foreground"
              >
                <X size={11} />
              </button>
            </div>
          ) : null}
          {type !== "INTERNAL_NOTE" && publicExtra ? (
            <div className="mt-2 flex items-center">{publicExtra}</div>
          ) : null}
          {sendErrorKey ? (
            <p className={`mt-2 ${errorTextClassName}`} role="alert">
              {ticketText(t, sendErrorKey)}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {onUpload ? (
              <>
                <input
                  ref={fileInputReference}
                  aria-label={t("tickets.detail.attach")}
                  tabIndex={-1}
                  className="sr-only"
                  type="file"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file === undefined) {
                      return;
                    }
                    setIsUploading(true);
                    void onUpload(file).finally(() => {
                      setIsUploading(false);
                      event.target.value = "";
                    });
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isSending || isUploading}
                  onClick={() => fileInputReference.current?.click()}
                >
                  <Paperclip size={14} /> {t("tickets.detail.attach")}
                </Button>
              </>
            ) : null}
            {templates ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isSending}
                  onClick={() => (pickerOpen ? closePicker() : openPicker())}
                  title={t("templates.picker.shortcut")}
                  aria-haspopup="dialog"
                  aria-expanded={pickerOpen}
                  data-testid="composer-template-button"
                >
                  <FileText size={14} /> {t("templates.picker.button")}
                </Button>
                {templates.canSavePersonal ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isSending || body.trim().length === 0}
                    onClick={() => setSaveAsOpen(true)}
                  >
                    <BookmarkPlus size={14} /> {t("templates.picker.saveAs")}
                  </Button>
                ) : null}
              </>
            ) : null}
            <span className="text-[11px] text-muted-foreground">
              {t("tickets.detail.attachHint")}
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {!internal && canWaitForUser && onWaitForUser ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={isSending}
                  onClick={() => {
                    void (async () => {
                      try {
                        if (body.trim().length > 0 && !(await submit())) {
                          return;
                        }
                        onWaitForUser();
                      } catch {
                        return;
                      }
                    })();
                  }}
                >
                  {t("tickets.detail.waitForUser")}
                </Button>
              ) : null}
              <Button type="submit" size="sm" disabled={isSending || body.trim().length === 0}>
                <Send size={13} />
                {isSending
                  ? t("tickets.detail.sending")
                  : internal
                    ? t("tickets.detail.sendNote")
                    : t("tickets.detail.send")}
              </Button>
            </div>
          </div>
        </div>
      </form>
      <ConfirmDialog
        open={confirmReason !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmReason(null);
        }}
        title={t("tickets.collaboration.collision.title")}
        description={confirmReason ?? ""}
        confirmLabel={t("tickets.collaboration.collision.sendAnyway")}
        isPending={isSending}
        onConfirm={() => {
          setConfirmReason(null);
          void send().catch(() => undefined);
        }}
      />
      {templates && saveAsOpen ? (
        <SaveAsTemplateDialog
          body={body}
          kind={type === "INTERNAL_NOTE" ? "INTERNAL" : "REPLY"}
          onClose={() => setSaveAsOpen(false)}
        />
      ) : null}
    </Card>
  );
}
