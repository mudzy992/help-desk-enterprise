import { BookmarkPlus, FileText, Paperclip, Send } from "lucide-react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { ComposerTemplatesOptions } from "@/components/tickets/ticket-message-composer-types";

interface TicketMessageComposerActionsProperties {
  readonly body: string;
  readonly internal: boolean;
  readonly isSending: boolean;
  readonly isUploading: boolean;
  readonly setIsUploading: Dispatch<SetStateAction<boolean>>;
  readonly fileInputReference: MutableRefObject<HTMLInputElement | null>;
  readonly onUpload?: (file: File) => Promise<void>;
  readonly templates?: ComposerTemplatesOptions;
  readonly pickerOpen: boolean;
  readonly openPicker: () => void;
  readonly closePicker: () => void;
  readonly setSaveAsOpen: Dispatch<SetStateAction<boolean>>;
  readonly onWaitForUserClick?: () => void;
}

export function TicketMessageComposerActions(props: TicketMessageComposerActionsProperties) {
  const { t } = useTranslation();
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {props.onUpload ? (
        <>
          <input
            ref={props.fileInputReference}
            aria-label={t("tickets.detail.attach")}
            tabIndex={-1}
            className="sr-only"
            type="file"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              const input = event.currentTarget;
              if (file === undefined) return;
              props.setIsUploading(true);
              void (async () => {
                try {
                  await props.onUpload?.(file);
                } catch {
                  // The detail controller exposes the mapped upload error in its header.
                } finally {
                  props.setIsUploading(false);
                  input.value = "";
                }
              })();
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={props.isSending || props.isUploading}
            onClick={() => props.fileInputReference.current?.click()}
          >
            <Paperclip size={14} /> {t("tickets.detail.attach")}
          </Button>
        </>
      ) : null}
      {props.templates ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={props.isSending}
            onClick={() => (props.pickerOpen ? props.closePicker() : props.openPicker())}
            title={t("templates.picker.shortcut")}
            aria-haspopup="dialog"
            aria-expanded={props.pickerOpen}
            data-testid="composer-template-button"
          >
            <FileText size={14} /> {t("templates.picker.button")}
          </Button>
          {props.templates.canSavePersonal ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={props.isSending || props.body.trim().length === 0}
              onClick={() => props.setSaveAsOpen(true)}
            >
              <BookmarkPlus size={14} /> {t("templates.picker.saveAs")}
            </Button>
          ) : null}
        </>
      ) : null}
      <span className="text-[11px] text-muted-foreground">{t("tickets.detail.attachHint")}</span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {!props.internal && props.onWaitForUserClick ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={props.isSending}
            onClick={props.onWaitForUserClick}
          >
            {t("tickets.detail.waitForUser")}
          </Button>
        ) : null}
        <Button
          type="submit"
          size="sm"
          disabled={props.isSending || props.body.trim().length === 0}
        >
          <Send size={13} />
          {props.isSending
            ? t("tickets.detail.sending")
            : props.internal
              ? t("tickets.detail.sendNote")
              : t("tickets.detail.send")}
        </Button>
      </div>
    </div>
  );
}
