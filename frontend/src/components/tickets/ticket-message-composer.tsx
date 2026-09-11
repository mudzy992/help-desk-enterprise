import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { controlClassName, labelClassName, textareaClassName } from "@/components/ui/control";
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
    <form className="mt-4 grid gap-3 border-t border-border/70 pt-4" onSubmit={(event) => void onSubmit(event)}>
      <label className={labelClassName}>
        {t("tickets.detail.messageType")}
        <select
          className={controlClassName}
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
      <label className={labelClassName}>
        {t("tickets.detail.compose")}
        <textarea
          className={textareaClassName}
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
