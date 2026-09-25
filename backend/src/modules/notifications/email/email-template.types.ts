import type {
  EmailLocale,
  EmailTemplateField,
  EmailTemplateKey,
  EmailTemplatePlaceholder,
} from './email-template.constants';

/**
 * Text of one e-mail (decision E1): the admin edits these fields, the HTML
 * layout lives in code. `subjectConfidential` is used for confidential or
 * restricted tickets (E3); `footer` is optional extra text.
 */
export type EmailTemplateContent = Readonly<Record<EmailTemplateField, string>>;

export type EmailTemplateSet = Readonly<Record<EmailTemplateKey, EmailTemplateContent>>;

/** Registry v2: one complete set per locale (defaults merged in per field). */
export type EmailTemplateRegistry = Readonly<Record<EmailLocale, EmailTemplateSet>>;

export type EmailTemplateVariables = Readonly<
  Partial<Record<EmailTemplatePlaceholder, string>>
>;

/** Legacy v1 shape, still accepted from stored settings. */
export type EmailTemplateDefinition = {
  readonly subject: string;
  readonly body: string;
};

export type RenderedEmailTemplate = {
  readonly subject: string;
  readonly text: string;
};
