import { createHash } from 'node:crypto';
import { classifyServiceFormPattern } from './service-form-pattern-safety';
import type { ServiceFormPatternSafetyReason } from './service-form-pattern-safety';

export type ServiceFormPatternInventoryRow = {
  readonly id: string;
  readonly serviceId: string;
  readonly version: number;
  readonly status: 'DRAFT' | 'ACTIVE' | 'RETIRED';
  readonly schema: unknown;
};

export type ServiceFormPatternInventoryEntry = {
  readonly formVersionId: string;
  readonly serviceId: string;
  readonly version: number;
  readonly formVersionStatus: 'DRAFT' | 'ACTIVE' | 'RETIRED';
  readonly fieldId: string;
  readonly patternLength: number;
  readonly patternSha256: string;
  readonly classification: 'SAFE' | 'UNSAFE';
  readonly reason?: ServiceFormPatternSafetyReason;
};

export type ServiceFormPatternInventoryReport = {
  readonly formVersionCount: number;
  readonly formsWithPatterns: number;
  readonly patternCount: number;
  readonly safePatternCount: number;
  readonly unsafePatternCount: number;
  readonly patterns: readonly ServiceFormPatternInventoryEntry[];
};

/** Pure classifier used by the read-only production inventory CLI and unit tests. */
export function classifyServiceFormPatternInventory(
  rows: readonly ServiceFormPatternInventoryRow[],
): ServiceFormPatternInventoryReport {
  const patterns: ServiceFormPatternInventoryEntry[] = [];
  const formsWithPatterns = new Set<string>();

  for (const row of rows) {
    const schema = asRecord(row.schema);
    if (!Array.isArray(schema?.fields)) continue;
    for (const [index, candidate] of schema.fields.entries()) {
      const field = asRecord(candidate);
      const validation = asRecord(field?.validation);
      const pattern = validation?.pattern;
      if (typeof pattern !== 'string') continue;

      formsWithPatterns.add(row.id);
      const classification = classifyServiceFormPattern(pattern);
      patterns.push({
        formVersionId: row.id,
        serviceId: row.serviceId,
        version: row.version,
        formVersionStatus: row.status,
        fieldId: typeof field?.id === 'string' ? field.id : `field_${index}`,
        patternLength: pattern.length,
        patternSha256: createHash('sha256').update(pattern, 'utf8').digest('hex'),
        classification: classification.safe ? 'SAFE' : 'UNSAFE',
        ...(classification.safe ? {} : { reason: classification.reason }),
      });
    }
  }

  const safePatternCount = patterns.filter((pattern) => pattern.classification === 'SAFE').length;
  return {
    formVersionCount: rows.length,
    formsWithPatterns: formsWithPatterns.size,
    patternCount: patterns.length,
    safePatternCount,
    unsafePatternCount: patterns.length - safePatternCount,
    patterns,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    return null;
  }
  return value as Record<string, unknown>;
}
