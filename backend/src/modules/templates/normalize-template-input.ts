import type { ResponseTemplateKind } from '../../generated/prisma/enums';
import { templateLimits } from './templates.constants';
import { TemplatesError } from './templates.error';
import { findUnknownPlaceholders } from './template-placeholders';
import type { TemplateScope } from './template-scope';

export type ResponseTemplateInput = {
  readonly name: string;
  readonly bodyBs: string;
  readonly bodyEn?: string | null;
  readonly kind: ResponseTemplateKind;
  readonly tags?: readonly string[];
  readonly isActive?: boolean;
  readonly serviceIds?: readonly string[];
  readonly categoryIds?: readonly string[];
  readonly groupIds?: readonly string[];
};

export type NormalizedResponseTemplate = {
  readonly name: string;
  readonly bodyBs: string;
  readonly bodyEn: string | null;
  readonly kind: ResponseTemplateKind;
  readonly tags: readonly string[];
  readonly isActive: boolean;
  readonly scope: TemplateScope;
};

/** Collapses runs of whitespace in single-line values. */
export function normalizeName(value: string, code: 'TEMPLATE_NAME_INVALID' | 'PLAYBOOK_NAME_INVALID'): string {
  const name = value.replace(/\s+/g, ' ').trim();
  if (name.length < templateLimits.nameMin || name.length > templateLimits.nameMax) {
    throw new TemplatesError(code);
  }
  return name;
}

/** Keeps line breaks, trims the ends, unifies CRLF. */
export function normalizeMultiline(value: string | null | undefined): string {
  return (value ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim();
}

export function normalizeIds(values: readonly string[] | undefined): readonly string[] {
  const ids = [...new Set((values ?? []).map((value) => value.trim()).filter((value) => value.length > 0))];
  if (ids.length > templateLimits.scopeItemsMax) {
    throw new TemplatesError('TEMPLATE_SCOPE_INVALID');
  }
  return ids.sort();
}

export function normalizeTags(values: readonly string[] | undefined): readonly string[] {
  const tags = [
    ...new Set(
      (values ?? [])
        .map((value) => value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('bs'))
        .filter((value) => value.length > 0),
    ),
  ];
  if (tags.length > templateLimits.tagsMax || tags.some((tag) => tag.length > templateLimits.tagMax)) {
    throw new TemplatesError('TEMPLATE_TAGS_INVALID');
  }
  return tags;
}

function normalizeBody(value: string | null | undefined, required: boolean): string | null {
  const body = normalizeMultiline(value);
  if (body.length === 0) {
    if (required) throw new TemplatesError('TEMPLATE_BODY_INVALID');
    return null;
  }
  if (body.length > templateLimits.bodyMax) {
    throw new TemplatesError('TEMPLATE_BODY_INVALID');
  }
  const unknown = findUnknownPlaceholders(body);
  if (unknown.length > 0) {
    throw new TemplatesError('TEMPLATE_UNKNOWN_VARIABLE', { variables: unknown });
  }
  return body;
}

export function normalizeResponseTemplateInput(input: ResponseTemplateInput): NormalizedResponseTemplate {
  return {
    name: normalizeName(input.name, 'TEMPLATE_NAME_INVALID'),
    bodyBs: normalizeBody(input.bodyBs, true) as string,
    bodyEn: normalizeBody(input.bodyEn, false),
    kind: input.kind,
    tags: normalizeTags(input.tags),
    isActive: input.isActive ?? true,
    scope: {
      serviceIds: normalizeIds(input.serviceIds),
      categoryIds: normalizeIds(input.categoryIds),
      groupIds: normalizeIds(input.groupIds),
    },
  };
}

export function normalizeReason(value: string | undefined): string {
  const reason = (value ?? '').replace(/\s+/g, ' ').trim();
  if (reason.length < templateLimits.reasonMin || reason.length > templateLimits.reasonMax) {
    throw new TemplatesError('REASON_REQUIRED');
  }
  return reason;
}
