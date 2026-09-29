import { configVersioningErrorCodes } from '../config-versioning.constants';
import { ConfigVersioningError } from '../config-versioning.error';
import { mappableReferenceKinds, type ConfigPackageReferenceKind } from './config-package.constants';
import type { ConfigPackageMappings } from './config-package.types';

const invalid = (path: string) =>
  new ConfigVersioningError(configVersioningErrorCodes.packageInvalid, [
    { code: 'options', path, message: `Invalid ${path}` },
  ]);

/** Multipart text → typed mappings; only mappable kinds, string → string. */
export function parseConfigPackageMappings(raw: string | undefined): ConfigPackageMappings {
  if (raw === undefined || raw.trim() === '') return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw invalid('mappings');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw invalid('mappings');
  const result: Partial<Record<ConfigPackageReferenceKind, Record<string, string>>> = {};
  for (const [kind, entries] of Object.entries(value as Record<string, unknown>)) {
    if (!mappableReferenceKinds.includes(kind as ConfigPackageReferenceKind)) throw invalid(`mappings.${kind}`);
    if (entries === null || typeof entries !== 'object' || Array.isArray(entries)) throw invalid(`mappings.${kind}`);
    const map: Record<string, string> = {};
    for (const [key, id] of Object.entries(entries as Record<string, unknown>)) {
      if (typeof id !== 'string' || id.trim() === '' || id.length > 64) throw invalid(`mappings.${kind}.${key}`);
      map[key] = id;
    }
    result[kind as ConfigPackageReferenceKind] = map;
  }
  return result;
}

export function readFlag(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

export function parseConfigPackageFile(file: { readonly buffer: Buffer } | undefined): unknown {
  if (file === undefined) throw invalid('file');
  try {
    return JSON.parse(file.buffer.toString('utf8'));
  } catch {
    throw invalid('file');
  }
}
