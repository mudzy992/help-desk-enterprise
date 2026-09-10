import {
  createPublicKey,
  type JsonWebKey as CryptoJsonWebKey,
  type KeyObject,
} from 'node:crypto';
import { AuthenticationError } from './authentication.error';

type EntraJsonWebKey = CryptoJsonWebKey & {
  readonly kid?: string;
};

export async function resolveEntraJwksPublicKey(input: {
  readonly jwksUrl: string;
  readonly keyId: string;
  readonly fetchImplementation: typeof fetch;
}): Promise<KeyObject> {
  const document = await fetchJwksDocument(input);
  const matchingKey = document.keys.find((key) => key.kid === input.keyId);
  if (matchingKey === undefined) {
    throw new AuthenticationError('INVALID_CREDENTIALS');
  }
  try {
    return createPublicKey({
      key: matchingKey,
      format: 'jwk',
    });
  } catch {
    throw new AuthenticationError('AUTHENTICATION_UNAVAILABLE');
  }
}

async function fetchJwksDocument(input: {
  readonly jwksUrl: string;
  readonly fetchImplementation: typeof fetch;
}): Promise<{ keys: readonly EntraJsonWebKey[] }> {
  let response: Response;
  try {
    response = await input.fetchImplementation(input.jwksUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new AuthenticationError('AUTHENTICATION_UNAVAILABLE');
  }
  if (!response.ok) {
    throw new AuthenticationError('AUTHENTICATION_UNAVAILABLE');
  }
  let document: unknown;
  try {
    document = await response.json();
  } catch {
    throw new AuthenticationError('AUTHENTICATION_UNAVAILABLE');
  }
  return parseJwksDocument(document);
}

function parseJwksDocument(
  document: unknown,
): { keys: readonly EntraJsonWebKey[] } {
  if (
    document === null ||
    typeof document !== 'object' ||
    !('keys' in document) ||
    !Array.isArray(document.keys)
  ) {
    throw new AuthenticationError('AUTHENTICATION_UNAVAILABLE');
  }
  return {
    keys: document.keys.filter(isEntraJsonWebKey),
  };
}

function isEntraJsonWebKey(value: unknown): value is EntraJsonWebKey {
  return value !== null && typeof value === 'object';
}
