import { TicketConversation } from "@/components/tickets/ticket-conversation";
import { TicketMessageComposer } from "@/components/tickets/ticket-message-composer";
import { Avatar } from "@/components/ui/avatar";
import type { ComposerAccess } from "@/lib/tickets/message-composer-access";
import type { MessageType, TicketMessageResponse } from "@/services/tickets-collaboration-api";
import type { TicketResponse } from "@/services/tickets-api";
import { useTranslation } from "react-i18next";

interface TicketDetailConversationProperties {
  readonly ticket: TicketResponse;
  readonly messages: readonly TicketMessageResponse[];
  readonly currentUserId: string | null;
  readonly authorNames: ReadonlyMap<string, string>;
  readonly requesterName: string;
  readonly access: ComposerAccess;
  readonly isSending: boolean;
  readonly canWaitForUser: boolean;
  readonly onSend: (type: MessageType, body: string) => Promise<void>;
  readonly onWaitForUser?: () => void;
}

export function TicketDetailConversation(props: TicketDetailConversationProperties) {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex gap-3">
        <Avatar name={props.requesterName} size="md" />
        <div className="min-w-0 max-w-[78%]">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-foreground">
              {props.requesterName}
            </span>
            <span className="text-[10.5px] text-muted-foreground/70">
              {t("tickets.detail.description")}
            </span>
          </div>
          <div className="mt-1 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-[13px] leading-relaxed text-foreground/95">
            <p className="whitespace-pre-wrap">{props.ticket.description}</p>
          </div>
        </div>
      </div>
      <div className="mt-3">
        <TicketConversation
          messages={props.messages}
          currentUserId={props.currentUserId}
          authorNames={props.authorNames}
        />
      </div>
      {props.ticket.status === "ARCHIVED" ? null : (
        <TicketMessageComposer
          access={props.access}
          isSending={props.isSending}
          canWaitForUser={props.canWaitForUser}
          onSend={props.onSend}
          onWaitForUser={props.onWaitForUser}
        />
      )}
    </>
  );
}
