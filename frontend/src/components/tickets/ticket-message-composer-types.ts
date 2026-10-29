import type { ReactNode } from "react";
import type { ComposerAccess } from "@/lib/tickets/message-composer-access";
import type { TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import type { MessageType } from "@/services/tickets-collaboration-api";

export type {
  ComposerCollaborationOptions,
  ComposerInsertText,
  ComposerSendOptions,
  ComposerTemplatesOptions,
} from "@/lib/tickets/message-composer-contracts";
import type {
  ComposerCollaborationOptions,
  ComposerInsertText,
  ComposerSendOptions,
  ComposerTemplatesOptions,
} from "@/lib/tickets/message-composer-contracts";

export interface TicketMessageComposerProperties {
  readonly ticketId: string;
  readonly access: ComposerAccess;
  readonly isSending: boolean;
  readonly sendErrorKey?: TicketErrorKey | null;
  readonly canWaitForUser?: boolean;
  readonly onSend: (
    type: MessageType,
    body: string,
    options?: ComposerSendOptions,
  ) => Promise<void>;
  readonly onWaitForUser?: () => void;
  readonly onUpload?: (file: File) => Promise<void>;
  /** Extra control shown only for public replies ("also to merged"). */
  readonly publicExtra?: ReactNode;
  /** Template picker; omitted for requesters. */
  readonly templates?: ComposerTemplatesOptions;
  readonly collaboration?: ComposerCollaborationOptions;
  readonly insertText?: ComposerInsertText | null;
}
