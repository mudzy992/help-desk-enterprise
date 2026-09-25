import { apiRequest } from "@/services/api";

export const emailTemplateFieldNames = [
  "subject",
  "subjectConfidential",
  "heading",
  "body",
  "cta",
  "footer",
] as const;
export type EmailTemplateField = (typeof emailTemplateFieldNames)[number];
export type EmailTemplateContent = Readonly<Record<EmailTemplateField, string>>;
export type EmailTemplateLocale = "bs" | "en";
export type EmailTemplateRegistry = Readonly<
  Record<EmailTemplateLocale, Readonly<Record<string, EmailTemplateContent>>>
>;

export type EmailTemplatesOverview = {
  readonly locales: readonly EmailTemplateLocale[];
  readonly keys: readonly string[];
  readonly ticketKeys: readonly string[];
  readonly fields: readonly EmailTemplateField[];
  readonly placeholders: readonly string[];
  readonly defaults: EmailTemplateRegistry;
  readonly templates: EmailTemplateRegistry;
  readonly overrides: Record<string, unknown>;
  readonly templatesEnabled: boolean;
  readonly delivery: {
    readonly deliveryEnabled: boolean;
    readonly hasSmtpTransport: boolean;
    readonly provider: "o365" | "gmail" | "smtp";
    readonly providers: readonly string[];
    readonly fromAddress: string | null;
    readonly replyMode: "no_reply" | "shared_mailbox";
    readonly configuredReplyMode: "no_reply" | "shared_mailbox";
    readonly replyToAddress: string | null;
    readonly publicUrlConfigured: boolean;
  };
};

export type RenderedEmail = {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
};

export type EmailPreviewInput = {
  readonly key: string;
  readonly locale: EmailTemplateLocale;
  readonly content?: Partial<EmailTemplateContent>;
  readonly confidential?: boolean;
};

export function getEmailTemplates(): Promise<EmailTemplatesOverview> {
  return apiRequest("/settings/email-templates");
}

export function saveEmailTemplates(input: {
  readonly overrides: Record<string, unknown>;
  readonly reason: string;
}): Promise<EmailTemplatesOverview> {
  return apiRequest("/settings/email-templates", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function previewEmailTemplate(input: EmailPreviewInput): Promise<RenderedEmail> {
  return apiRequest("/settings/email-templates/preview", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function sendTestEmailTemplate(
  input: EmailPreviewInput,
): Promise<{ readonly toAddress: string }> {
  return apiRequest("/settings/email-templates/test", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
