import { createInvalidCredentialsError } from './authentication.error';
import { isEntraDirectoryObjectIdentifier } from './entra-authentication.constants';
import type { NormalizedEntraIdentity } from './entra-id-token.verifier';
import { normalizeEmailAddress } from './normalize-email-address';

export function normalizeEntraIdTokenClaims(input: {
  readonly payload: Readonly<Record<string, unknown>>;
  readonly tenantId: string;
}): NormalizedEntraIdentity {
  const tenantId = readDirectoryObjectIdentifier(input.payload.tid);
  if (tenantId !== input.tenantId) {
    throw createInvalidCredentialsError();
  }
  const displayName = readRequiredText(input.payload.name);
  return {
    externalSubject: readDirectoryObjectIdentifier(input.payload.oid),
    email: readEmailClaim(input.payload),
    displayName,
    tenantId,
  };
}

function readEmailClaim(payload: Readonly<Record<string, unknown>>): string {
  const email = readOptionalText(payload.email);
  if (email !== null) {
    return normalizeRequiredEmail(email);
  }
  return normalizeRequiredEmail(readRequiredText(payload.preferred_username));
}

function normalizeRequiredEmail(value: string): string {
  const email = normalizeEmailAddress(value);
  if (!email.includes('@')) {
    throw createInvalidCredentialsError();
  }
  return email;
}

function readDirectoryObjectIdentifier(value: unknown): string {
  const text = readRequiredText(value).toLowerCase();
  if (!isEntraDirectoryObjectIdentifier(text)) {
    throw createInvalidCredentialsError();
  }
  return text;
}

function readRequiredText(value: unknown): string {
  const text = readOptionalText(value);
  if (text === null) {
    throw createInvalidCredentialsError();
  }
  return text;
}

function readOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.trim();
  if (text.length === 0) {
    return null;
  }
  return text;
}
