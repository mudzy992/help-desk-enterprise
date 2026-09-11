import { TicketConversation } from "@/components/tickets/ticket-conversation";
import { TicketMessageComposer } from "@/components/tickets/ticket-message-composer";
import type { ComposerAccess } from "@/lib/tickets/message-composer-access";
import type { MessageType, TicketMessageResponse } from "@/services/tickets-collaboration-api";
import type { TicketResponse } from "@/services/tickets-api";
import { useTranslation } from "react-i18next";

interface TicketDetailConversationProperties {
  readonly ticket: TicketResponse;
  readonly messages: readonly TicketMessageResponse[];
  readonly currentUserId: string | null;
  readonly access: ComposerAccess;
  readonly isSending: boolean;
  readonly onSend: (type: MessageType, body: string) => Promise<void>;
}

export function TicketDetailConversation(props: TicketDetailConversationProperties) {
  const { t } = useTranslation();
  return (
    <section className="rounded-lg border border-border bg-surface">
      <h3 className="border-b border-border/70 px-4 pb-3 pt-3.5 text-[13.5px] font-semibold text-foreground">
        {t("tickets.detail.conversation")}
      </h3>
      <div className="px-4 py-3.5">
        <TicketConversation messages={props.messages} currentUserId={props.currentUserId} />
        {props.ticket.status === "ARCHIVED" ? null : (
          <TicketMessageComposer
            access={props.access}
            isSending={props.isSending}
            onSend={props.onSend}
          />
        )}
      </div>
    </section>
  );
}
