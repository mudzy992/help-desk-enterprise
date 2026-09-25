import { SettingsError } from '../../settings/settings.error';
import {
  emailLocales,
  emailTemplateFields,
  emailTemplateKeys,
  emailTemplatePlaceholders,
  type EmailLocale,
  type EmailTemplateField,
  type EmailTemplateKey,
} from './email-template.constants';
import { defaultEmailTemplates } from './default-email-templates';
import type {
  EmailTemplateContent,
  EmailTemplateRegistry,
  EmailTemplateSet,
} from './email-template.types';

const placeholderPattern = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g;
const allowedPlaceholders = new Set<string>(emailTemplatePlaceholders);
const maximumFieldLength = 4000;
/** Fields that may be left empty (fall back to nothing, not to the default). */
const optionalFields = new Set<EmailTemplateField>(['footer']);

/**
 * Stored registry → complete registry. Accepts
 *  - v2 `{ version: 2, locales: { bs: { key: { field } } } }` and
 *  - v1 `{ key: { subject, body } }` (read as bs overrides).
 * Missing locales, keys and fields come from the built-in defaults, field by
 * field. Anything invalid throws, so a bad value is refused when it is saved
 * instead of silently falling back when an e-mail is sent.
 */
export function parseEmailTemplateRegistry(value: unknown): EmailTemplateRegistry {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return defaultEmailTemplates;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw invalidTemplate('Email templates JSON is not valid');
  }
  if (!isRecord(parsed)) {
    throw invalidTemplate('Email templates must be a JSON object');
  }
  if (parsed.version === 2) {
    if (!isRecord(parsed.locales)) {
      throw invalidTemplate('Email templates v2 need a "locales" object');
    }
    return mergeLocales(parsed.locales);
  }
  // v1: the subject may already contain the number; the renderer then does
  // not prefix it a second time.
  return mergeLocales({ bs: parsed });
}

export function assertEmailTemplateRegistryJson(value: string): void {
  parseEmailTemplateRegistry(value);
}

/** Only what differs from the defaults (what the admin actually changed). */
export function diffEmailTemplateRegistry(
  templates: EmailTemplateRegistry,
): Record<string, Record<string, Partial<EmailTemplateContent>>> {
  const result: Record<string, Record<string, Partial<EmailTemplateContent>>> = {};
  for (const locale of emailLocales) {
    for (const key of emailTemplateKeys) {
      const changed: Partial<Record<EmailTemplateField, string>> = {};
      for (const field of emailTemplateFields) {
        if (templates[locale][key][field] !== defaultEmailTemplates[locale][key][field]) {
          changed[field] = templates[locale][key][field];
        }
      }
      if (Object.keys(changed).length > 0) {
        result[locale] = { ...(result[locale] ?? {}), [key]: changed };
      }
    }
  }
  return result;
}

export function findUnknownPlaceholders(text: string): readonly string[] {
  const unknown: string[] = [];
  for (const match of text.matchAll(placeholderPattern)) {
    const name = match[1] ?? '';
    if (!allowedPlaceholders.has(name)) {
      unknown.push(name);
    }
  }
  return unknown;
}

function mergeLocales(source: Record<string, unknown>): EmailTemplateRegistry {
  for (const locale of Object.keys(source)) {
    if (!isLocale(locale)) {
      throw invalidTemplate(`Unknown email template locale: ${locale}`);
    }
  }
  const merged = {} as Record<EmailLocale, EmailTemplateSet>;
  for (const locale of emailLocales) {
    const localeSource = source[locale];
    if (localeSource !== undefined && !isRecord(localeSource)) {
      throw invalidTemplate(`Email templates for ${locale} must be an object`);
    }
    merged[locale] = mergeSet(locale, localeSource ?? {});
  }
  return merged;
}

function mergeSet(
  locale: EmailLocale,
  source: Record<string, unknown>,
): EmailTemplateSet {
  for (const key of Object.keys(source)) {
    if (!isTemplateKey(key)) {
      throw invalidTemplate(`Unknown email template key: ${key}`);
    }
  }
  const set = { ...defaultEmailTemplates[locale] } as Record<EmailTemplateKey, EmailTemplateContent>;
  for (const key of emailTemplateKeys) {
    const entry = source[key];
    if (entry === undefined) {
      continue;
    }
    if (!isRecord(entry)) {
      throw invalidTemplate(`Email template ${locale}.${key} must be an object`);
    }
    set[key] = mergeContent(`${locale}.${key}`, defaultEmailTemplates[locale][key], entry);
  }
  return set;
}

function mergeContent(
  path: string,
  fallback: EmailTemplateContent,
  entry: Record<string, unknown>,
): EmailTemplateContent {
  const allowed = new Set<string>(emailTemplateFields);
  for (const field of Object.keys(entry)) {
    if (!allowed.has(field)) {
      throw invalidTemplate(`Email template ${path} has an unknown field "${field}"`);
    }
  }
  const result = { ...fallback } as Record<EmailTemplateField, string>;
  for (const field of emailTemplateFields) {
    const value = entry[field];
    if (value === undefined) {
      continue;
    }
    if (typeof value !== 'string') {
      throw invalidTemplate(`Email template ${path}.${field} must be a string`);
    }
    if (value.trim().length === 0 && !optionalFields.has(field)) {
      throw invalidTemplate(`Email template ${path}.${field} must not be empty`);
    }
    if (value.length > maximumFieldLength) {
      throw invalidTemplate(`Email template ${path}.${field} is too long`);
    }
    const unknown = findUnknownPlaceholders(value);
    if (unknown.length > 0) {
      throw invalidTemplate(
        `Email template ${path}.${field} uses unsupported placeholder {{${unknown[0]}}}`,
      );
    }
    result[field] = value;
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isLocale(value: string): value is EmailLocale {
  return (emailLocales as readonly string[]).includes(value);
}

function isTemplateKey(value: string): value is EmailTemplateKey {
  return (emailTemplateKeys as readonly string[]).includes(value);
}

function invalidTemplate(message: string): SettingsError {
  return new SettingsError(message, 'INVALID_EMAIL_TEMPLATE');
}
