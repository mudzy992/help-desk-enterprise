import {
  emailTemplateKeys,
  emailTemplatePlaceholders,
  type EmailTemplateDefinition,
  type EmailTemplateKey,
  type EmailTemplateRegistry,
} from "@/lib/settings/email-template-keys";

const placeholderPattern = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g;
const allowedPlaceholders = new Set<string>(emailTemplatePlaceholders);

export function parseEmailTemplateRegistry(value: string): EmailTemplateRegistry | null {
  if (value.trim().length === 0) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const source = parsed as Record<string, unknown>;
    const templates = {} as EmailTemplateRegistry;
    for (const key of emailTemplateKeys) {
      const definition = parseDefinition(source[key]);
      if (definition === null) {
        return null;
      }
      templates[key] = definition;
    }
    return templates;
  } catch {
    return null;
  }
}

export function serializeEmailTemplateRegistry(
  templates: EmailTemplateRegistry,
): string {
  return JSON.stringify(templates);
}

export function validateEmailTemplateText(text: string): boolean {
  if (text.trim().length === 0) {
    return false;
  }
  for (const match of text.matchAll(placeholderPattern)) {
    const name = match[1];
    if (name === undefined || !allowedPlaceholders.has(name)) {
      return false;
    }
  }
  return true;
}

export function isEmailTemplateRegistryValid(
  templates: EmailTemplateRegistry,
): boolean {
  return emailTemplateKeys.every(
    (key: EmailTemplateKey) =>
      validateEmailTemplateText(templates[key].subject) &&
      validateEmailTemplateText(templates[key].body),
  );
}

function parseDefinition(value: unknown): EmailTemplateDefinition | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.subject !== "string" || typeof record.body !== "string") {
    return null;
  }
  if (
    !validateEmailTemplateText(record.subject) ||
    !validateEmailTemplateText(record.body)
  ) {
    return null;
  }
  return { subject: record.subject, body: record.body };
}
