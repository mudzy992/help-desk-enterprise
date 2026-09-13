import type {
  EmailTemplateKey,
  EmailTemplatePlaceholder,
} from './email-template.constants';

export type EmailTemplateDefinition = {
  readonly subject: string;
  readonly body: string;
};

export type EmailTemplateRegistry = Readonly<
  Record<EmailTemplateKey, EmailTemplateDefinition>
>;

export type EmailTemplateVariables = Readonly<
  Record<EmailTemplatePlaceholder, string>
>;

export type RenderedEmailTemplate = {
  readonly subject: string;
  readonly text: string;
};
