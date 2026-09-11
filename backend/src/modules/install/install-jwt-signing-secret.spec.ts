import { authenticationConstants } from '../authentication/authentication.constants';
import {
  generateInstallJwtSigningSecret,
  isUsableJwtSigningSecret,
} from './install-jwt-signing-secret';

describe('install JWT signing secret helpers', () => {
  it('generates unique secrets that meet the session signing minimum', () => {
    const first = generateInstallJwtSigningSecret();
    const second = generateInstallJwtSigningSecret();
    expect(isUsableJwtSigningSecret(first)).toBe(true);
    expect(isUsableJwtSigningSecret(second)).toBe(true);
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(
      authenticationConstants.minimumJwtSigningSecretLength,
    );
  });

  it('rejects missing or short secrets', () => {
    expect(isUsableJwtSigningSecret(undefined)).toBe(false);
    expect(isUsableJwtSigningSecret('short')).toBe(false);
    expect(isUsableJwtSigningSecret(' '.repeat(32))).toBe(false);
  });
});
