import type { FormEvent } from "react";
import { useRef, useState } from "react";
import { TicketMessageComposerMode } from "@/components/tickets/ticket-message-composer-mode";
import { useTranslation } from "react-i18next";
import { SaveAsTemplateDialog } from "@/components/templates/save-as-template-dialog";
import { TicketMessageComposerActions } from "@/components/tickets/ticket-message-composer-actions";
import { TicketMessageComposerEditor } from "@/components/tickets/ticket-message-composer-editor";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useShortcut } from "@/lib/shortcuts/shortcuts-context";
import { useTicketComposerFocus } from "@/lib/tickets/use-ticket-composer-focus";
import { useTicketComposerDraft } from "@/lib/tickets/use-ticket-composer-draft";
import { useTicketComposerMentions } from "@/lib/tickets/use-ticket-composer-mentions";
import { useTicketComposerTemplates } from "@/lib/tickets/use-ticket-composer-templates";
import type { TicketMessageComposerProperties } from "@/components/tickets/ticket-message-composer-types";
import { clearSessionValue } from "@/lib/tickets/ticket-draft-storage";

export type {
  ComposerCollaborationOptions,
  ComposerInsertText,
  ComposerSendOptions,
  ComposerTemplatesOptions,
} from "@/components/tickets/ticket-message-composer-types";

export function TicketMessageComposer({
  ticketId,
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
  insertText = null,
}: TicketMessageComposerProperties) {
  const { t } = useTranslation();
  const draft = useTicketComposerDraft(ticketId, access);
  const textareaReference = useRef<HTMLTextAreaElement>(null);
  const fileInputReference = useRef<HTMLInputElement>(null);
  const scheduleFocus = useTicketComposerFocus();
  const [isUploading, setIsUploading] = useState(false);
  const [confirmReason, setConfirmReason] = useState<string | null>(null);
  const mentionsActive = collaboration?.mentionsEnabled === true && draft.type === "INTERNAL_NOTE";
  const mentions = useTicketComposerMentions({
    active: mentionsActive,
    bodyReference: draft.bodyReference,
    setBody: draft.setBody,
    textareaReference,
    scheduleFocus,
  });
  const templateState = useTicketComposerTemplates({
    templates,
    insertText,
    type: draft.type,
    bodyReference: draft.bodyReference,
    textareaReference,
    setBody: draft.setBody,
    setInternal: draft.setInternal,
    scheduleFocus,
  });
  const focusEditor = (asInternal: boolean) => {
    draft.setInternal(asInternal && draft.canInternal);
    mentions.dismiss();
    scheduleFocus(() => textareaReference.current?.focus());
  };
  useShortcut("reply", () => focusEditor(false));
  useShortcut("internalNote", () => focusEditor(true), draft.canInternal);
  useShortcut("send", null);
  useShortcut("leaveEditor", null);

  const send = async () => {
    await onSend(
      draft.type,
      draft.body.trim(),
      templateState.usedTemplate === null
        ? undefined
        : { responseTemplateId: templateState.usedTemplate.id },
    );
    clearDraft();
  };
  const clearDraft = () => {
    clearSessionValue(draft.draftStorageKey);
    draft.bodyReference.current = "";
    // The storage effect removes the key after the state is cleared.
    draft.setBody("");
    templateState.clearUsedTemplate();
    mentions.dismiss();
    collaboration?.onTyping(null);
  };

  /** Resolves false when the send waits for the collision confirmation. */
  const submit = async (): Promise<boolean> => {
    if (draft.body.trim().length === 0) return true;
    if (collaboration !== undefined && draft.type !== "INTERNAL_NOTE") {
      const reason = collaboration.confirmBeforePublicSend();
      if (reason !== null) {
        setConfirmReason(reason);
        return false;
      }
    }
    await send();
    return true;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await submit();
    } catch {
      return;
    }
  };
  const handleWaitForUser = async () => {
    if (onWaitForUser === undefined) return;
    try {
      if (draft.body.trim().length > 0 && !(await submit())) return;
      onWaitForUser();
    } catch {
      return;
    }
  };

  return (
    <Card className="mt-4">
      <form onSubmit={(event) => void handleSubmit(event)}>
        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2">
          <TicketMessageComposerMode
            canInternal={draft.canInternal}
            internal={draft.internal}
            onChange={(nextInternal) => {
              draft.setInternal(nextInternal);
              mentions.dismiss();
            }}
          />
          <span className="ml-auto text-[11px] text-muted-foreground">
            {draft.internal ? t("tickets.detail.internalHint") : t("tickets.detail.publicHint")}
          </span>
        </div>
        <TicketMessageComposerEditor
          type={draft.type}
          internal={draft.internal}
          canInternal={draft.canInternal}
          body={draft.body}
          setBody={draft.setBody}
          textareaReference={textareaReference}
          isSending={isSending}
          templates={templates}
          collaboration={collaboration}
          pickerOpen={templateState.pickerOpen}
          openPicker={templateState.openPicker}
          closePicker={templateState.closePicker}
          onTemplateInserted={templateState.onTemplateInserted}
          mention={mentions.mention}
          mentionCandidates={mentions.mentionCandidates}
          mentionIndex={mentions.mentionIndex}
          onMentionCandidates={mentions.setMentionCandidates}
          onPickMention={mentions.pickMention}
          onUpdateMention={mentions.updateMention}
          onDismissMention={mentions.dismiss}
          onMentionKeyDown={mentions.handleKeyDown}
          submit={submit}
          insertErrorKey={templateState.insertErrorKey}
          usedTemplate={templateState.usedTemplate}
          onClearUsedTemplate={templateState.clearUsedTemplate}
          publicExtra={publicExtra}
          sendErrorKey={sendErrorKey}
        />
        <TicketMessageComposerActions
          body={draft.body}
          internal={draft.internal}
          isSending={isSending}
          isUploading={isUploading}
          setIsUploading={setIsUploading}
          fileInputReference={fileInputReference}
          onUpload={onUpload}
          templates={templates}
          pickerOpen={templateState.pickerOpen}
          openPicker={templateState.openPicker}
          closePicker={templateState.closePicker}
          setSaveAsOpen={templateState.setSaveAsOpen}
          onWaitForUserClick={
            canWaitForUser && onWaitForUser !== undefined
              ? () => void handleWaitForUser()
              : undefined
          }
        />
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
      {templates && templateState.saveAsOpen ? (
        <SaveAsTemplateDialog
          body={draft.body}
          kind={draft.type === "INTERNAL_NOTE" ? "INTERNAL" : "REPLY"}
          onClose={() => templateState.setSaveAsOpen(false)}
        />
      ) : null}
    </Card>
  );
}
