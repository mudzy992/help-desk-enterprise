import { type FormEvent, useRef, useState } from "react";
import { MessageSquareLock, Paperclip, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Segmented, type SegmentedItem } from "@/components/ui/segmented";
import { errorTextClassName, textareaClassName } from "@/components/ui/control";
import { cn } from "@/lib/utils";
import {
  defaultMessageType,
  messageTypesForAccess,
  type ComposerAccess,
} from "@/lib/tickets/message-composer-access";
import type { TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { ticketText } from "@/lib/tickets/ticket-text";
import type { MessageType } from "@/services/tickets-collaboration-api";

type ComposerMode = "reply" | "internal";

interface TicketMessageComposerProperties {
  readonly access: ComposerAccess;
  readonly isSending: boolean;
  readonly sendErrorKey?: TicketErrorKey | null;
  readonly canWaitForUser?: boolean;
  readonly onSend: (type: MessageType, body: string) => Promise<void>;
  readonly onWaitForUser?: () => void;
  readonly onUpload?: (file: File) => Promise<void>;
}

export function TicketMessageComposer({
  access,
  isSending,
  sendErrorKey = null,
  canWaitForUser = false,
  onSend,
  onWaitForUser,
  onUpload,
}: TicketMessageComposerProperties) {
  const { t } = useTranslation();
  const types = messageTypesForAccess(access);
  const canInternal = types.includes("INTERNAL_NOTE");
  const [internal, setInternal] = useState(false);
  const [body, setBody] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputReference = useRef<HTMLInputElement>(null);
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

  const submit = async () => {
    if (body.trim().length === 0) {
      return;
    }
    await onSend(type, body.trim());
    setBody("");
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
            ariaLabel={t("tickets.detail.publicReply")}
            value={internal && canInternal ? "internal" : "reply"}
            onChange={(next) => setInternal(next === "internal")}
            items={composerModes}
          />
          <span className="ml-auto text-[11px] text-muted-foreground/70">
            {internal ? t("tickets.detail.internalHint") : t("tickets.detail.publicHint")}
          </span>
        </div>
        <div className="p-3">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void submit().catch(() => undefined);
              }
            }}
            placeholder={
              internal ? t("tickets.detail.composeInternal") : t("tickets.detail.composePublic")
            }
            className={cn(textareaClassName, "min-h-20 resize-y")}
            disabled={isSending}
          />
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
            <span className="text-[11px] text-muted-foreground/60">
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
                        if (body.trim().length > 0) {
                          await submit();
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
    </Card>
  );
}
