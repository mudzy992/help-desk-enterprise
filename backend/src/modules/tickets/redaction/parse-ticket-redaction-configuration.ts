import { TicketsError } from '../tickets.error';
import { parseRequiredSettingCsv } from '../parse-setting-csv';
import {
  defaultRedactionPatterns,
  defaultTicketRedactionConfiguration,
  redactionFieldKeys,
  redactionModes,
  redactionRiskLevels,
  type RedactionFieldKey,
  type RedactionMode,
  type RedactionRisk,
} from './redaction.constants';
import type {
  RedactionPatternDefinition,
  TicketRedactionConfiguration,
} from './redaction.types';

export function parseTicketRedactionConfiguration(input: {
  readonly enabled: unknown;
  readonly mode: unknown;
  readonly applyToFieldsCsv: unknown;
  readonly patternsJson: unknown;
}): TicketRedactionConfiguration {
  if (input.enabled === false) {
    return {
      ...defaultTicketRedactionConfiguration,
      enabled: false,
      applyToFields: [...defaultTicketRedactionConfiguration.applyToFields],
      patterns: [...defaultTicketRedactionConfiguration.patterns],
    };
  }
  if (input.enabled !== true || typeof input.mode !== 'string') {
    throw new TicketsError('REDACTION_UNAVAILABLE');
  }
  const mode = input.mode.trim() as RedactionMode;
  if (!redactionModes.includes(mode)) {
    throw new TicketsError('REDACTION_UNAVAILABLE');
  }
  let applyToFields: readonly string[];
  try {
    applyToFields = parseRequiredSettingCsv(input.applyToFieldsCsv);
  } catch {
    throw new TicketsError('REDACTION_UNAVAILABLE');
  }
  const fields = applyToFields.filter((item): item is RedactionFieldKey =>
    redactionFieldKeys.includes(item as RedactionFieldKey),
  );
  if (fields.length === 0) {
    throw new TicketsError('REDACTION_UNAVAILABLE');
  }
  return {
    enabled: true,
    mode,
    applyToFields: fields,
    patterns: parsePatternsJson(input.patternsJson),
  };
}

function parsePatternsJson(value: unknown): readonly RedactionPatternDefinition[] {
  if (value === undefined || value === null || value === '') {
    return [...defaultRedactionPatterns];
  }
  if (typeof value !== 'string') {
    throw new TicketsError('REDACTION_UNAVAILABLE');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new TicketsError('REDACTION_UNAVAILABLE');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new TicketsError('REDACTION_UNAVAILABLE');
  }
  return parsed.map(parsePatternEntry);
}

function parsePatternEntry(value: unknown): RedactionPatternDefinition {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TicketsError('REDACTION_UNAVAILABLE');
  }
  const entry = value as Record<string, unknown>;
  if (typeof entry.id !== 'string' || typeof entry.pattern !== 'string') {
    throw new TicketsError('REDACTION_UNAVAILABLE');
  }
  const flags = typeof entry.flags === 'string' ? entry.flags : '';
  const risk = parseRisk(entry.risk);
  assertUsablePattern(entry.pattern, flags);
  return {
    id: entry.id.trim(),
    source: entry.pattern,
    flags,
    risk,
  };
}

function parseRisk(value: unknown): RedactionRisk {
  if (value === undefined) {
    return 'high';
  }
  if (typeof value === 'string' && redactionRiskLevels.includes(value as RedactionRisk)) {
    return value as RedactionRisk;
  }
  throw new TicketsError('REDACTION_UNAVAILABLE');
}

function assertUsablePattern(source: string, flags: string): void {
  try {
    const compiled = new RegExp(source, flags);
    compiled.test('probe');
  } catch {
    throw new TicketsError('REDACTION_UNAVAILABLE');
  }
}
