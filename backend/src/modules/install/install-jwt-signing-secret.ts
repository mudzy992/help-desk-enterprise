import { randomBytes } from 'node:crypto';
import { authenticationConstants } from '../authentication/authentication.constants';

const jwtSigningSecretByteLength = 32;

export function generateInstallJwtSigningSecret(): string {
  return randomBytes(jwtSigningSecretByteLength).toString('base64url');
}

export function isUsableJwtSigningSecret(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length >= authenticationConstants.minimumJwtSigningSecretLength
  );
}
