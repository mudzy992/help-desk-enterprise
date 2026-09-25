import type { ComposerSendOptions, ComposerTemplatesOptions } from "@/components/tickets/ticket-message-composer";
import { TicketConversation } from "@/components/tickets/ticket-conversation";
import { TicketMessageComposer } from "@/components/tickets/ticket-message-composer";
import { Avatar } from "@/components/ui/avatar";
import type { ComposerAccess } from "@/lib/tickets/message-composer-access";
import type { TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import type { MessageType, TicketMessageResponse } from "@/services/tickets-collaboration-api";
import type { TicketResponse } from "@/services/tickets-api";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface TicketDetailConversationProperties {
  readonly ticket: TicketResponse;
  readonly messages: readonly TicketMessageResponse[];
  readonly currentUserId: string | null;
  readonly authorNames: ReadonlyMap<string, string>;
  readonly requesterName: string;
  readonly access: ComposerAccess;
  readonly isSending: boolean;
  readonly sendErrorKey?: TicketErrorKey | null;
  readonly canWaitForUser: boolean;
  readonly onSend: (type: MessageType, body: string, options?: ComposerSendOptions) => Promise<void>;
  readonly onWaitForUser?: () => void;
  readonly onUpload?: (file: File) => Promise<void>;
  readonly composerExtra?: ReactNode;
  readonly composerTemplates?: ComposerTemplatesOptions;
}

export function TicketDetailConversation(props: TicketDetailConversationProperties) {
  const { t } = useTranslation();
  return (
    <>
      <div className="fade-in flex gap-3">
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
          <div className="mt-1 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-[13px] leading-relaxed text-foreground/95 shadow-card">
            <p className="whitespace-pre-wrap">{props.ticket.description}</p>
          </div>
        </div>
      </div>
      <div className="mt-3">
        <TicketConversation
          messages={props.messages}
          currentUserId={props.currentUserId}
          authorNames={props.authorNames}
          viewport="fixed"
        />
      </div>
      {props.ticket.status === "ARCHIVED" ? null : props.ticket.mergedIntoTicketId ? (
        // Package 1.2 (M3): a merged child is read-only; replies go to the parent.
        <p className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-[12.5px] text-muted-foreground" data-testid="ticket-merged-composer-notice">
          {t("tickets.merge.composerNotice")}{" "}
          <Link className="tnum font-medium text-link hover:underline" to={`/tickets/${props.ticket.mergedIntoTicketId}`}>
            {props.ticket.mergedIntoTicketNumber ?? t("tickets.merge.parentFallback")}
          </Link>
        </p>
      ) : (
        <TicketMessageComposer
          access={props.access}
          isSending={props.isSending}
          sendErrorKey={props.sendErrorKey}
          canWaitForUser={props.canWaitForUser}
          onSend={props.onSend}
          onWaitForUser={props.onWaitForUser}
          onUpload={props.onUpload}
          publicExtra={props.composerExtra}
          templates={props.composerTemplates}
        />
      )}
    </>
  );
}
