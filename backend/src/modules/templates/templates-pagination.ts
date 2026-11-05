import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { templatesListDefaultTake, templatesListMaximumTake } from './templates.constants';

export const templatesCursorKinds = {
  managedResponseTemplates: 'templates-managed-response-v1',
  managedPlaybooks: 'templates-managed-playbooks-v1',
  responseTemplatePicker: 'templates-response-picker-v1',
  ticketPlaybookCandidates: 'templates-ticket-playbook-candidates-v1',
} as const;

export type TemplatesCursorPage<T> = {
  readonly items: readonly T[];
  readonly take: number;
  readonly cursor: string | null;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
};

export type TemplatesCountedCursorPage<T> = TemplatesCursorPage<T> & {
  readonly total: number;
};

export type TemplatesNameCursor = {
  readonly name: string;
  readonly id: string;
  readonly filterKey: string;
};

export type TemplatesTierNameCursor = TemplatesNameCursor & {
  readonly tier: string;
};

export type TemplatePickerCursor = {
  readonly rank: number;
  readonly usageCount: number;
  readonly name: string;
  readonly id: string;
  readonly filterKey: string;
};

export function templatesPageLimit(requested: number | undefined): number {
  return Math.min(templatesListMaximumTake, Math.max(1, requested ?? templatesListDefaultTake));
}

/** Cursor filters are bound to the actor, scope and search so a cursor cannot cross queries. */
export function templatesFilterKey(filters: unknown): string {
  return createHash('sha256').update(JSON.stringify(filters)).digest('hex');
}

export function encodeTemplatesNameCursor(kind: string, cursor: TemplatesNameCursor): string {
  return encodeCursor({ kind, ...cursor });
}

export function decodeTemplatesNameCursor(
  value: string | undefined,
  kind: string,
  filterKey: string,
): TemplatesNameCursor | null {
  if (value === undefined) return null;
  const decoded = decodeCursor(value);
  if (
    decoded === null ||
    decoded.kind !== kind ||
    typeof decoded.name !== 'string' ||
    decoded.name.length === 0 ||
    typeof decoded.id !== 'string' ||
    decoded.id.length === 0 ||
    decoded.filterKey !== filterKey
  ) {
    throw invalidTemplatesCursor();
  }
  return { name: decoded.name, id: decoded.id, filterKey: decoded.filterKey };
}

export function encodeTemplatesTierNameCursor(kind: string, cursor: TemplatesTierNameCursor): string {
  return encodeCursor({ kind, ...cursor });
}

export function decodeTemplatesTierNameCursor(
  value: string | undefined,
  kind: string,
  filterKey: string,
  allowedTiers: readonly string[],
): TemplatesTierNameCursor | null {
  if (value === undefined) return null;
  const decoded = decodeCursor(value);
  if (
    decoded === null ||
    decoded.kind !== kind ||
    typeof decoded.tier !== 'string' ||
    !allowedTiers.includes(decoded.tier) ||
    typeof decoded.name !== 'string' ||
    decoded.name.length === 0 ||
    typeof decoded.id !== 'string' ||
    decoded.id.length === 0 ||
    decoded.filterKey !== filterKey
  ) {
    throw invalidTemplatesCursor();
  }
  return {
    tier: decoded.tier,
    name: decoded.name,
    id: decoded.id,
    filterKey: decoded.filterKey,
  };
}

export function encodeTemplatePickerCursor(cursor: TemplatePickerCursor): string {
  return encodeCursor({
    kind: templatesCursorKinds.responseTemplatePicker,
    ...cursor,
  });
}

export function decodeTemplatePickerCursor(
  value: string | undefined,
  filterKey: string,
  allowedRanks: readonly number[],
): TemplatePickerCursor | null {
  if (value === undefined) return null;
  const decoded = decodeCursor(value);
  if (
    decoded === null ||
    decoded.kind !== templatesCursorKinds.responseTemplatePicker ||
    typeof decoded.rank !== 'number' ||
    !Number.isInteger(decoded.rank) ||
    !allowedRanks.includes(decoded.rank) ||
    typeof decoded.usageCount !== 'number' ||
    !Number.isInteger(decoded.usageCount) ||
    decoded.usageCount < 0 ||
    typeof decoded.name !== 'string' ||
    decoded.name.length === 0 ||
    typeof decoded.id !== 'string' ||
    decoded.id.length === 0 ||
    decoded.filterKey !== filterKey
  ) {
    throw invalidTemplatesCursor();
  }
  return {
    rank: decoded.rank,
    usageCount: decoded.usageCount,
    name: decoded.name,
    id: decoded.id,
    filterKey: decoded.filterKey,
  };
}

export function afterTemplatesNameCursor(cursor: Pick<TemplatesNameCursor, 'name' | 'id'>) {
  return {
    OR: [{ name: { gt: cursor.name } }, { name: cursor.name, id: { gt: cursor.id } }],
  };
}

export function afterTemplatePickerCursor(cursor: Pick<TemplatePickerCursor, 'usageCount' | 'name' | 'id'>) {
  return {
    OR: [
      { usageCount: { lt: cursor.usageCount } },
      { usageCount: cursor.usageCount, name: { gt: cursor.name } },
      {
        usageCount: cursor.usageCount,
        name: cursor.name,
        id: { gt: cursor.id },
      },
    ],
  };
}

function encodeCursor(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeCursor(value: string): Record<string, unknown> | null {
  if (value.length === 0 || value.length > 1024) throw invalidTemplatesCursor();
  try {
    const decodedText = Buffer.from(value, 'base64url').toString('utf8');
    if (Buffer.from(decodedText, 'utf8').toString('base64url') !== value) {
      throw invalidTemplatesCursor();
    }
    const decoded: unknown = JSON.parse(decodedText);
    if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
      throw invalidTemplatesCursor();
    }
    return decoded as Record<string, unknown>;
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw invalidTemplatesCursor();
  }
}

function invalidTemplatesCursor(): BadRequestException {
  return new BadRequestException('INVALID_TEMPLATES_CURSOR');
}
