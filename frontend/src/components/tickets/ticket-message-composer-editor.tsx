import type { Dispatch, KeyboardEvent, MutableRefObject, ReactNode, SetStateAction } from "react";
import { FileText, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MentionPicker } from "@/components/tickets/mention-picker";
import { TICKET_CONVERSATION_ID } from "@/components/tickets/ticket-conversation";
import { TemplatePicker } from "@/components/templates/template-picker";
import type { InsertedTemplate } from "@/lib/tickets/message-composer-contracts";
import { errorTextClassName, textareaClassName } from "@/components/ui/control";
import type { TemplatesErrorKey } from "@/lib/templates/map-templates-error";
import type {
  ComposerCollaborationOptions,
  ComposerTemplatesOptions,
} from "@/lib/tickets/message-composer-contracts";
import type { MentionQuery } from "@/lib/tickets/mention-tokens";
import type { TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { isSlashTrigger } from "@/lib/templates/insert-at-cursor";
import type { MessageType } from "@/services/tickets-collaboration-api";
import type { MentionCandidate } from "@/services/tickets-agent-collaboration-api";
import { cn } from "@/lib/utils";

interface TicketMessageComposerEditorProperties {
  readonly type: MessageType;
  readonly internal: boolean;
  readonly canInternal: boolean;
  readonly body: string;
  readonly setBody: Dispatch<SetStateAction<string>>;
  readonly textareaReference: MutableRefObject<HTMLTextAreaElement | null>;
  readonly isSending: boolean;
  readonly templates?: ComposerTemplatesOptions;
  readonly collaboration?: ComposerCollaborationOptions;
  readonly pickerOpen: boolean;
  readonly openPicker: () => void;
  readonly closePicker: () => void;
  readonly onTemplateInserted: (inserted: InsertedTemplate) => void;
  readonly mention: MentionQuery | null;
  readonly mentionCandidates: readonly MentionCandidate[];
  readonly mentionIndex: number;
  readonly onMentionCandidates: Dispatch<SetStateAction<readonly MentionCandidate[]>>;
  readonly onPickMention: (candidate: MentionCandidate) => void;
  readonly onUpdateMention: (value: string, caret: number) => void;
  readonly onDismissMention: () => void;
  readonly onMentionKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean;
  readonly submit: () => Promise<boolean>;
  readonly insertErrorKey: TemplatesErrorKey | null;
  readonly usedTemplate: { readonly id: string; readonly name: string } | null;
  readonly onClearUsedTemplate: () => void;
  readonly publicExtra?: ReactNode;
  readonly sendErrorKey?: TicketErrorKey | null;
}

export function TicketMessageComposerEditor(props: TicketMessageComposerEditorProperties) {
  const { t } = useTranslation();
  const mentionsActive =
    props.collaboration?.mentionsEnabled === true && props.type === "INTERNAL_NOTE";
  return (
    <div className="relative p-3">
      {props.templates && props.pickerOpen ? (
        <TemplatePicker
          ticketId={props.templates.ticketId}
          kind={props.type === "INTERNAL_NOTE" ? "INTERNAL" : "REPLY"}
          onClose={props.closePicker}
          onInsert={props.onTemplateInserted}
        />
      ) : null}
      {props.collaboration !== undefined && mentionsActive && props.mention !== null ? (
        <MentionPicker
          ticketId={props.collaboration.ticketId}
          query={props.mention.query}
          activeIndex={props.mentionIndex}
          onCandidates={props.onMentionCandidates}
          onPick={props.onPickMention}
        />
      ) : null}
      <textarea
        ref={props.textareaReference}
        value={props.body}
        data-testid="ticket-composer-body"
        aria-label={
          props.internal && props.canInternal
            ? t("tickets.detail.internalNote")
            : t("tickets.detail.publicReply")
        }
        onChange={(event) => {
          const value = event.target.value;
          props.setBody(value);
          if (value.trim().length === 0) props.onClearUsedTemplate();
          props.onUpdateMention(value, event.target.selectionStart);
          props.collaboration?.onTyping(
            value.trim().length === 0
              ? null
              : props.type === "INTERNAL_NOTE"
                ? "internal"
                : "public",
          );
        }}
        onBlur={props.onDismissMention}
        onKeyDown={(event) => {
          if (props.onMentionKeyDown(event)) return;
          if (props.templates) {
            const shortcut =
              event.key.toLowerCase() === "t" && event.shiftKey && (event.ctrlKey || event.metaKey);
            const slash =
              event.key === "/" &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.altKey &&
              isSlashTrigger(
                props.body,
                event.currentTarget.selectionStart,
                event.currentTarget.selectionEnd,
              );
            if (shortcut || slash) {
              event.preventDefault();
              props.openPicker();
              return;
            }
          }
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            void props.submit().catch(() => undefined);
            return;
          }
          if (event.key === "Escape" && !props.pickerOpen) {
            event.preventDefault();
            const log = document.getElementById(TICKET_CONVERSATION_ID);
            if (log !== null) log.focus();
            else event.currentTarget.blur();
          }
        }}
        placeholder={
          props.internal ? t("tickets.detail.composeInternal") : t("tickets.detail.composePublic")
        }
        className={cn(textareaClassName, "min-h-20 resize-y")}
        disabled={props.isSending}
      />
      {props.insertErrorKey !== null ? (
        <p role="alert" className={`mt-2 ${errorTextClassName}`}>
          {t(props.insertErrorKey)}
        </p>
      ) : null}
      {props.usedTemplate !== null ? (
        <div
          className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated/60 px-2 py-0.5 text-[11.5px] text-muted-foreground"
          data-testid="composer-used-template"
        >
          <FileText size={11} />
          {t("templates.picker.usedTemplate", { name: props.usedTemplate.name })}
          <button
            type="button"
            onClick={props.onClearUsedTemplate}
            aria-label={t("templates.picker.clearTemplate")}
            className="rounded p-0.5 hover:bg-surface-hover hover:text-foreground"
          >
            <X size={11} />
          </button>
        </div>
      ) : null}
      {props.type !== "INTERNAL_NOTE" && props.publicExtra ? (
        <div className="mt-2 flex items-center">{props.publicExtra}</div>
      ) : null}
      {props.sendErrorKey ? (
        <p className={`mt-2 ${errorTextClassName}`} role="alert">
          {t(props.sendErrorKey)}
        </p>
      ) : null}
    </div>
  );
}
