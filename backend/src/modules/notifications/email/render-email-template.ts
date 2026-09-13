import { emailTemplatePlaceholders } from './email-template.constants';
import type {
  EmailTemplateDefinition,
  EmailTemplateVariables,
  RenderedEmailTemplate,
} from './email-template.types';

const placeholderPattern = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g;
const allowedPlaceholders = new Set<string>(emailTemplatePlaceholders);

export function renderEmailTemplate(
  template: EmailTemplateDefinition,
  variables: EmailTemplateVariables,
): RenderedEmailTemplate {
  return {
    subject: interpolate(template.subject, variables),
    text: interpolate(template.body, variables),
  };
}

function interpolate(
  source: string,
  variables: EmailTemplateVariables,
): string {
  return source.replace(placeholderPattern, (_match, name: string) => {
    if (!allowedPlaceholders.has(name)) {
      return '';
    }
    return sanitizeTemplateValue(
      variables[name as keyof EmailTemplateVariables],
    );
  });
}

function sanitizeTemplateValue(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
}
