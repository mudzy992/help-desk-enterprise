import {
  responseTemplateVariables,
  type ResponseTemplateVariable,
} from './templates.constants';

/** Same syntax as the e-mail templates of package 1.5: `{{ name }}`. */
const placeholderPattern = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g;
const known = new Set<string>(responseTemplateVariables);

export function extractPlaceholders(body: string): readonly string[] {
  const names = new Set<string>();
  for (const match of body.matchAll(placeholderPattern)) {
    names.add(match[1]);
  }
  return [...names];
}

export function findUnknownPlaceholders(body: string): readonly string[] {
  return extractPlaceholders(body).filter((name) => !known.has(name));
}

export type TemplateVariableValues = Readonly<
  Partial<Record<ResponseTemplateVariable, string | null>>
>;

export type FilledTemplate = {
  readonly text: string;
  /** Variables the template uses but the ticket has no value for (T3). */
  readonly missing: readonly ResponseTemplateVariable[];
};

/**
 * Replaces every known variable; a variable without a value becomes empty and
 * is reported in `missing`. Unknown names stay verbatim (they cannot be saved,
 * but an old template must still render). Plain text: nothing is escaped.
 */
export function fillTemplate(body: string, values: TemplateVariableValues): FilledTemplate {
  const missing = new Set<ResponseTemplateVariable>();
  const text = body.replace(placeholderPattern, (whole, name: string) => {
    if (!known.has(name)) {
      return whole;
    }
    const variable = name as ResponseTemplateVariable;
    const value = values[variable];
    if (value === undefined || value === null || value.trim().length === 0) {
      missing.add(variable);
      return '';
    }
    return value;
  });
  return { text, missing: responseTemplateVariables.filter((name) => missing.has(name)) };
}
