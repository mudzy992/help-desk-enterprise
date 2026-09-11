import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  defaultMessageType,
  messageTypesForAccess,
  type ComposerAccess,
} from "@/lib/tickets/message-composer-access";
import type { MessageType } from "@/services/tickets-collaboration-api";

interface TicketMessageComposerProperties {
  readonly access: ComposerAccess;
  readonly isSending: boolean;
  readonly onSend: (type: MessageType, body: string) => Promise<void>;
}

export function TicketMessageComposer({
  access,
  isSending,
  onSend,
}: TicketMessageComposerProperties) {
  const { t } = useTranslation();
  const types = messageTypesForAccess(access);
  const [type, setType] = useState<MessageType>(defaultMessageType(access));
  const [body, setBody] = useState("");

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (body.trim().length === 0) {
      return;
    }
    await onSend(type, body.trim());
    setBody("");
  };

  return (
    <form className="mt-4 grid gap-2" onSubmit={(event) => void onSubmit(event)}>
      <label className="grid gap-1 text-metadata text-muted-foreground">
        {t("tickets.detail.messageType")}
        <select
          className="h-8 rounded-md border border-input bg-surface px-2 text-metadata"
          value={type}
          onChange={(event) => setType(event.target.value as MessageType)}
        >
          {types.map((item) => (
            <option key={item} value={item}>
              {t(`tickets.messageType.${item}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-body">
        {t("tickets.detail.compose")}
        <textarea
          className="min-h-24 rounded-md border border-input bg-surface px-2 py-2 text-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          required
        />
      </label>
      <div>
        <Button type="submit" disabled={isSending || body.trim().length === 0}>
          {isSending ? t("tickets.detail.sending") : t("tickets.detail.send")}
        </Button>
      </div>
    </form>
  );
}
