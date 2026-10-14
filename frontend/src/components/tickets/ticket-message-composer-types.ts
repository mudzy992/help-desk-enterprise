import type { ReactNode } from "react";
import type { ComposerAccess } from "@/lib/tickets/message-composer-access";
import type { TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import type { MessageType } from "@/services/tickets-collaboration-api";

export type ComposerSendOptions = { readonly responseTemplateId?: string };

export type ComposerTemplatesOptions = {
  readonly ticketId: string;
  readonly canSavePersonal: boolean;
  /** A playbook step asked to insert its template; `nonce` makes repeats fire. */
  readonly insertRequest?: {
    readonly templateId: string;
    readonly name: string;
    readonly nonce: number;
  } | null;
};

/** Plain text to insert into the public reply; `nonce` makes repeats fire. */
export type ComposerInsertText = { readonly text: string; readonly nonce: number };

export type ComposerCollaborationOptions = {
  readonly ticketId: string;
  readonly mentionsEnabled: boolean;
  /** Called on every edit with the channel being typed in (null = cleared). */
  readonly onTyping: (channel: "public" | "internal" | null) => void;
  /** Reason to confirm before a public send (translated), or null. */
  readonly confirmBeforePublicSend: () => string | null;
};

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
