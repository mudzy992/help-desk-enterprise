import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { ConfigPackageHeader, ConfigPackageSignatureState, PortableConfig } from './config-package.types';

/** JSON with object keys sorted at every level, so the checksum is stable. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item === undefined ? null : item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
}

export function computeConfigPackageChecksum(header: ConfigPackageHeader, content: PortableConfig): string {
  return createHash('sha256').update(canonicalJson({ header, content }), 'utf8').digest('hex');
}

export function signConfigPackageChecksum(checksum: string, key: string): string {
  return createHmac('sha256', key).update(checksum, 'utf8').digest('hex');
}

export function verifyConfigPackageSignature(
  checksum: string,
  signature: string | null,
  key: string | null,
): ConfigPackageSignatureState {
  if (signature === null) return 'unsigned';
  if (key === null) return 'no_key';
  const expected = Buffer.from(signConfigPackageChecksum(checksum, key), 'hex');
  const actual = Buffer.from(signature, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? 'valid' : 'invalid';
}

/** CONFIG_PACKAGE_SIGNING_KEY must be at least 32 characters to count as set. */
export function readConfigPackageSigningKey(environment: NodeJS.ProcessEnv = process.env): string | null {
  const value = environment.CONFIG_PACKAGE_SIGNING_KEY?.trim() ?? '';
  return value.length >= 32 ? value : null;
}
