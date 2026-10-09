jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../authentication/security/mfa.service', () => ({ MfaService: class MfaService {} }));
jest.mock('../security/identity-passkey.service', () => ({
  IdentityPasskeyService: class IdentityPasskeyService {},
}));

import { ServiceUnavailableException } from '@nestjs/common';
import { AccountSecurityError } from '../authentication/security/account-security.error';
import type { PrivacyActor } from './privacy-actor';
import { IdentityPasskeyService } from '../security/identity-passkey.service';
import { PrivacyIdentityConfirmer } from './privacy-identity-confirmer';
import { PrivacyError } from './privacy.error';

const actor = { principal: { subjectId: 'u-1' }, requestId: null, sessionId: null } as unknown as PrivacyActor;

function confirmer(verifyError: Error | null) {
  const prisma = {
    user: { findUnique: jest.fn(async () => ({ id: 'u-1', email: 'a@b.ba', localPasswordHash: 'x', entraObjectId: null, userRoles: [] })) },
  };
  const mfa = {
    isEnabled: jest.fn(async () => true),
    verify: jest.fn(async () => {
      if (verifyError) throw verifyError;
      return 'totp';
    }),
  };
  // Paket 5.4.0-a: no fresh passkey marker in these tests.
  const identityPasskey = {
    consumeFreshConfirmation: jest.fn(async () => false),
  } as unknown as IdentityPasskeyService;
  return new PrivacyIdentityConfirmer(prisma as never, mfa as never, identityPasskey);
}

describe('PrivacyIdentityConfirmer', () => {
  it('accepts a valid code', async () => {
    await expect(confirmer(null).confirm(actor, '123456')).resolves.toBe('mfa');
  });

  it('asks for a code when none was sent', async () => {
    await expect(confirmer(null).confirm(actor, ' ')).rejects.toMatchObject({ code: 'IDENTITY_CONFIRMATION_REQUIRED' });
  });

  it('reports a wrong or reused code as confirmation failed', async () => {
    const result = confirmer(new AccountSecurityError('MFA_INVALID_CODE')).confirm(actor, '000000');
    await expect(result).rejects.toBeInstanceOf(PrivacyError);
    await expect(result).rejects.toMatchObject({ code: 'IDENTITY_CONFIRMATION_FAILED' });
  });

  it('does not disguise a server-side MFA problem as a wrong code', async () => {
    await expect(confirmer(new AccountSecurityError('MFA_UNAVAILABLE')).confirm(actor, '123456')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
