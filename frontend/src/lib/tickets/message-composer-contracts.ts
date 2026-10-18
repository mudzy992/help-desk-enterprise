import type { RenderedTemplate } from "@/services/templates-api";

export type ComposerSendOptions = { readonly responseTemplateId?: string };

export type ComposerTemplatesOptions = {
  readonly ticketId: string;
  readonly canSavePersonal: boolean;
  readonly insertRequest?: {
    readonly templateId: string;
    readonly name: string;
    readonly nonce: number;
  } | null;
};

export type ComposerInsertText = { readonly text: string; readonly nonce: number };

export type ComposerCollaborationOptions = {
  readonly ticketId: string;
  readonly mentionsEnabled: boolean;
  readonly onTyping: (channel: "public" | "internal" | null) => void;
  readonly confirmBeforePublicSend: () => string | null;
};

export type InsertedTemplate = {
  readonly templateId: string;
  readonly name: string;
  readonly rendered: RenderedTemplate;
};
