import type {
  ComposerCollaborationOptions,
  ComposerSendOptions,
  ComposerInsertText,
  ComposerTemplatesOptions,
} from "@/components/tickets/ticket-message-composer";
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
  readonly onSend: (
    type: MessageType,
    body: string,
    options?: ComposerSendOptions,
  ) => Promise<void>;
  readonly onWaitForUser?: () => void;
  readonly onUpload?: (file: File) => Promise<void>;
  readonly composerExtra?: ReactNode;
  readonly composerTemplates?: ComposerTemplatesOptions;
  readonly composerInsertText?: ComposerInsertText | null;
  readonly composerCollaboration?: ComposerCollaborationOptions;
  /** the viewer may write knowledge articles. */
  readonly canWriteKnowledge?: boolean;
}

export function TicketDetailConversation(props: TicketDetailConversationProperties) {
  const { t } = useTranslation();
  // public agent replies can become an article draft
  // (knowledge writers only; never from confidential tickets).
  const canDraftArticle = props.canWriteKnowledge === true && !props.ticket.isConfidential;
  const [articleSource, setArticleSource] = useState<{
    ticketId: string;
    messageId: string;
  } | null>(null);
  const footer =
    props.ticket.status === "ARCHIVED" ? null : props.ticket.mergedIntoTicketId ? (
      // a merged child is read-only; replies go to the parent.
      <p
        className="rounded-md border border-border bg-muted/40 px-3 py-2 text-[12.5px] text-foreground"
        data-testid="ticket-merged-composer-notice"
      >
        {t("tickets.merge.composerNotice")}{" "}
        <Link
          className="tnum font-medium text-link hover:underline"
          to={`/tickets/${props.ticket.mergedIntoTicketId}`}
        >
          {props.ticket.mergedIntoTicketNumber ?? t("tickets.merge.parentFallback")}
        </Link>
      </p>
    ) : (
      <TicketMessageComposer
        key={props.ticket.id}
        ticketId={props.ticket.id}
        access={props.access}
        isSending={props.isSending}
        sendErrorKey={props.sendErrorKey}
        canWaitForUser={props.canWaitForUser}
        onSend={props.onSend}
        onWaitForUser={props.onWaitForUser}
        onUpload={props.onUpload}
        publicExtra={props.composerExtra}
        templates={props.composerTemplates}
        insertText={props.composerInsertText}
        collaboration={props.composerCollaboration}
      />
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {canDraftArticle ? (
        <ArticleFromReplySheet
          source={articleSource}
          currentUserId={props.currentUserId}
          onOpenChange={(open) => {
            if (!open) setArticleSource(null);
          }}
        />
      ) : null}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {/*
          Opening request — Pulse primary tint (same family as merged banner /
          bulk bar) so the description reads as the conversation anchor without
          hardcoded colors.
        */}
        <div className="fade-in flex gap-3" data-testid="ticket-description-anchor">
          <Avatar name={props.requesterName} size="md" />
          <div className="min-w-0 max-w-[78%]">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-medium text-foreground">{props.requesterName}</span>
              <span className="rounded-full border border-primary/30 bg-surface px-1.5 py-px text-[10.5px] font-medium text-link">
                {t("tickets.detail.description")}
              </span>
            </div>
            <div className="mt-1 rounded-lg border border-primary/30 bg-primary/6 px-3.5 py-2.5 text-[13px] leading-relaxed text-foreground shadow-card">
              <p className="whitespace-pre-wrap">{props.ticket.description}</p>
            </div>
          </div>
        </div>
        <TicketConversation
          messages={props.messages}
          currentUserId={props.currentUserId}
          authorNames={props.authorNames}
          viewport="flow"
          renderMessageActions={
            canDraftArticle
              ? (message) =>
                  message.type === "AGENT_REPLY" ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      data-testid="message-to-article"
                      onClick={() =>
                        setArticleSource({ ticketId: props.ticket.id, messageId: message.id })
                      }
                    >
                      <BookPlus size={12} aria-hidden="true" />{" "}
                      {t("knowledgeBase.portal.fromReply.action")}
                    </Button>
                  ) : null
              : undefined
          }
        />
      </div>
      {footer ? (
        <div className="shrink-0 border-t border-border/60 bg-background pt-2 xl:pt-3">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
