import type { RedactionFieldKey } from './redaction.constants';
import type {
  CompiledRedactionPattern,
  RedactionMatch,
  RedactionScanResult,
  TicketRedactionConfiguration,
} from './redaction.types';

export function compileRedactionPatterns(
  configuration: TicketRedactionConfiguration,
): readonly CompiledRedactionPattern[] {
  return configuration.patterns.flatMap((pattern) => {
    try {
      return [
        {
          ...pattern,
          expression: new RegExp(pattern.source, withGlobalFlag(pattern.flags)),
        },
      ];
    } catch {
      return [];
    }
  });
}

export function scanTextForRedaction(
  field: RedactionFieldKey,
  value: string,
  configuration: TicketRedactionConfiguration,
): RedactionScanResult {
  if (!configuration.enabled || !configuration.applyToFields.includes(field)) {
    return { matches: [], blocked: false };
  }
  const matches: RedactionMatch[] = [];
  for (const pattern of compileRedactionPatterns(configuration)) {
    pattern.expression.lastIndex = 0;
    if (pattern.expression.test(value)) {
      matches.push({
        field,
        patternId: pattern.id,
        risk: pattern.risk,
      });
    }
  }
  const blocked =
    configuration.mode === 'soft_block' &&
    matches.some((match) => match.risk === 'high');
  return { matches, blocked };
}

export function mergeRedactionScans(
  scans: readonly RedactionScanResult[],
): RedactionScanResult {
  const matches = scans.flatMap((scan) => scan.matches);
  return {
    matches,
    blocked: scans.some((scan) => scan.blocked),
  };
}

function withGlobalFlag(flags: string): string {
  return flags.includes('g') ? flags : `${flags}g`;
}
