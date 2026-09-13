import { SettingsError } from '../../settings/settings.error';
import {
  emailTemplateKeys,
  emailTemplatePlaceholders,
  type EmailTemplateKey,
} from './email-template.constants';
import { defaultEmailTemplates } from './default-email-templates';
import type {
  EmailTemplateDefinition,
  EmailTemplateRegistry,
} from './email-template.types';

const placeholderPattern = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g;
const allowedPlaceholders = new Set<string>(emailTemplatePlaceholders);

export function parseEmailTemplateRegistry(
  value: unknown,
): EmailTemplateRegistry {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return defaultEmailTemplates;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw invalidTemplate('Email templates JSON is not valid');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw invalidTemplate('Email templates must be a JSON object');
  }
  const source = parsed as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    if (!isEmailTemplateKey(key)) {
      throw invalidTemplate(`Unknown email template key: ${key}`);
    }
  }
  const templates = { ...defaultEmailTemplates };
  for (const key of emailTemplateKeys) {
    if (source[key] === undefined) {
      continue;
    }
    templates[key] = parseTemplateDefinition(key, source[key]);
  }
  return templates;
}

export function assertEmailTemplateRegistryJson(value: string): void {
  parseEmailTemplateRegistry(value);
}

function parseTemplateDefinition(
  key: EmailTemplateKey,
  value: unknown,
): EmailTemplateDefinition {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidTemplate(`Email template ${key} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const subject = readRequiredText(`${key}.subject`, record.subject);
  const body = readRequiredText(`${key}.body`, record.body);
  assertAllowedPlaceholders(`${key}.subject`, subject);
  assertAllowedPlaceholders(`${key}.body`, body);
  return { subject, body };
}

function readRequiredText(path: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalidTemplate(`Email template ${path} must be a non-empty string`);
  }
  return value;
}

function assertAllowedPlaceholders(path: string, text: string): void {
  for (const match of text.matchAll(placeholderPattern)) {
    const name = match[1];
    if (name === undefined || !allowedPlaceholders.has(name)) {
      throw invalidTemplate(
        `Email template ${path} uses unsupported placeholder {{${name ?? ''}}}`,
      );
    }
  }
}

function isEmailTemplateKey(value: string): value is EmailTemplateKey {
  return emailTemplateKeys.some((key) => key === value);
}

function invalidTemplate(message: string): SettingsError {
  return new SettingsError(message, 'INVALID_EMAIL_TEMPLATE');
}
