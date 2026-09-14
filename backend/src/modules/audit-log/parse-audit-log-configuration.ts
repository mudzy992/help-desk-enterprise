import {
  allowedAuditExportFormats,
  allowedAuditHashAlgorithms,
  auditLogErrorCodes,
} from './audit-log.constants';
import {
  defaultAuditExportAllowedFormatsCsv,
  defaultAuditTamperEvidentHashAlgorithm,
} from '../settings/definitions/audit-log-settings';
import { AuditLogError } from './audit-log.error';
import type {
  AuditExportFormat,
  AuditHashAlgorithm,
  AuditLogConfiguration,
} from './audit-log.types';

export function parseAuditLogConfiguration(input: {
  readonly exportEnabled: unknown;
  readonly allowedFormatsCsv: unknown;
  readonly tamperEvidentEnabled: unknown;
  readonly hashAlgorithm: unknown;
}): AuditLogConfiguration {
  if (
    typeof input.exportEnabled !== 'boolean' ||
    typeof input.allowedFormatsCsv !== 'string' ||
    typeof input.tamperEvidentEnabled !== 'boolean' ||
    typeof input.hashAlgorithm !== 'string'
  ) {
    throw new AuditLogError(auditLogErrorCodes.exportDisabled);
  }
  return {
    exportEnabled: input.exportEnabled,
    allowedFormats: parseFormats(input.allowedFormatsCsv),
    tamperEvidentEnabled: input.tamperEvidentEnabled,
    hashAlgorithm: parseHashAlgorithm(input.hashAlgorithm),
  };
}

function parseFormats(value: string): readonly AuditExportFormat[] {
  const source =
    value.trim().length === 0 ? defaultAuditExportAllowedFormatsCsv : value;
  const formats = [
    ...new Set(
      source
        .split(',')
        .map((token) => token.trim().toLowerCase())
        .filter((token) => token.length > 0),
    ),
  ];
  const allowed = new Set<string>(allowedAuditExportFormats);
  if (formats.length === 0 || formats.some((format) => !allowed.has(format))) {
    throw new AuditLogError(auditLogErrorCodes.formatNotAllowed);
  }
  return formats as AuditExportFormat[];
}

function parseHashAlgorithm(value: string): AuditHashAlgorithm {
  const algorithm =
    value.trim().length === 0
      ? defaultAuditTamperEvidentHashAlgorithm
      : value.trim().toLowerCase();
  if (!allowedAuditHashAlgorithms.includes(algorithm as AuditHashAlgorithm)) {
    throw new AuditLogError(auditLogErrorCodes.hashAlgorithmUnsupported);
  }
  return algorithm as AuditHashAlgorithm;
}
