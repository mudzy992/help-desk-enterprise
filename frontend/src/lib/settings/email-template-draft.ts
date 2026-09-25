import {
  emailTemplateFieldNames,
  type EmailTemplateContent,
  type EmailTemplateLocale,
  type EmailTemplateRegistry,
} from "@/services/email-templates-api";

const placeholderPattern = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g;

/** Placeholders the server would refuse — shown live under the field. */
export function findUnknownPlaceholders(
  text: string,
  allowed: readonly string[],
): readonly string[] {
  const known = new Set(allowed);
  const unknown = new Set<string>();
  for (const match of text.matchAll(placeholderPattern)) {
    const name = match[1] ?? "";
    if (!known.has(name)) unknown.add(name);
  }
  return [...unknown];
}

/** Inserts `{{name}}` at the caret (or replaces the selection). */
export function insertPlaceholder(
  value: string,
  name: string,
  selectionStart: number | null,
  selectionEnd: number | null,
): { readonly value: string; readonly caret: number } {
  const token = `{{${name}}}`;
  const start = selectionStart ?? value.length;
  const end = selectionEnd ?? start;
  return {
    value: `${value.slice(0, start)}${token}${value.slice(end)}`,
    caret: start + token.length,
  };
}

export function isTemplateModified(
  current: EmailTemplateContent,
  defaults: EmailTemplateContent,
): boolean {
  return emailTemplateFieldNames.some((field) => current[field] !== defaults[field]);
}

/** Only texts that differ from the built-in defaults are sent to the server. */
export function buildTemplateOverrides(
  templates: EmailTemplateRegistry,
  defaults: EmailTemplateRegistry,
): Record<string, Record<string, Partial<EmailTemplateContent>>> {
  const result: Record<string, Record<string, Partial<EmailTemplateContent>>> = {};
  for (const locale of Object.keys(templates) as EmailTemplateLocale[]) {
    for (const [key, content] of Object.entries(templates[locale])) {
      const fallback = defaults[locale]?.[key];
      if (fallback === undefined) continue;
      const changed: Partial<Record<(typeof emailTemplateFieldNames)[number], string>> = {};
      for (const field of emailTemplateFieldNames) {
        if (content[field] !== fallback[field]) changed[field] = content[field];
      }
      if (Object.keys(changed).length > 0) {
        result[locale] = { ...(result[locale] ?? {}), [key]: changed };
      }
    }
  }
  return result;
}

export function replaceTemplate(
  templates: EmailTemplateRegistry,
  locale: EmailTemplateLocale,
  key: string,
  content: EmailTemplateContent,
): EmailTemplateRegistry {
  return { ...templates, [locale]: { ...templates[locale], [key]: content } };
}
