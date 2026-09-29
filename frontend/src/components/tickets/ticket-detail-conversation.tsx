import type { ComposerCollaborationOptions, ComposerSendOptions, ComposerTemplatesOptions } from "@/components/tickets/ticket-message-composer";
import { TicketConversation } from "@/components/tickets/ticket-conversation";
import { TicketMessageComposer } from "@/components/tickets/ticket-message-composer";
import { ArticleFromReplySheet } from "@/components/knowledge-base/portal/article-from-reply-sheet";
import { Button } from "@/components/ui/button";
import { BookPlus } from "lucide-react";
import { useState } from "react";
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
  readonly composerCollaboration?: ComposerCollaborationOptions;
  /** Paket 2.9 (K1c): the viewer may write knowledge articles. */
  readonly canWriteKnowledge?: boolean;
}

export function TicketDetailConversation(props: TicketDetailConversationProperties) {
  const { t } = useTranslation();
  // Paket 2.9 (K1c): public agent replies can become an article draft
  // (knowledge writers only; never from confidential tickets).
  const canDraftArticle = props.canWriteKnowledge === true && !props.ticket.isConfidential;
  const [articleSource, setArticleSource] = useState<{ ticketId: string; messageId: string } | null>(null);
  return (
    <>
      {canDraftArticle ? (
        <ArticleFromReplySheet
          source={articleSource}
          currentUserId={props.currentUserId}
          onOpenChange={(open) => {
            if (!open) setArticleSource(null);
          }}
        />
      ) : null}
      <div className="fade-in flex gap-3">
        <Avatar name={props.requesterName} size="md" />
        <div className="min-w-0 max-w-[78%]">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-foreground">
              {props.requesterName}
            </span>
            <span className="text-[10.5px] text-muted-foreground">
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
          renderMessageActions={
            canDraftArticle
              ? (message) =>
                  message.type === "AGENT_REPLY" ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      data-testid="message-to-article"
                      onClick={() => setArticleSource({ ticketId: props.ticket.id, messageId: message.id })}
                    >
                      <BookPlus size={12} aria-hidden="true" /> {t("knowledgeBase.portal.fromReply.action")}
                    </Button>
                  ) : null
              : undefined
          }
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
          collaboration={props.composerCollaboration}
        />
      )}
    </>
  );
}
