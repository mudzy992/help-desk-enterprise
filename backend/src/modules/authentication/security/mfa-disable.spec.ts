jest.mock('../../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { defaultAccountSecurityPolicy } from './account-security-policy';
import { AccountSecurityError } from './account-security.error';
import { MfaService } from './mfa.service';

const superAdmin = {
  id: 'user-1',
  email: 'admin@example.test',
  roleKeys: ['SUPER_ADMIN'],
  localPasswordHash: 'bcrypt-hash',
  entraObjectId: null,
};

describe('MFA disable', () => {
  function makeService() {
    const notifier = { audit: jest.fn().mockResolvedValue(undefined), notify: jest.fn().mockResolvedValue(undefined) };
    // Any database access would throw a TypeError here, so a refusal that is
    // reached before the code check is the only way the call can succeed.
    const service = new MfaService({} as never, notifier as never);
    return { service, notifier };
  }

  it('refuses to disable TOTP for a required account, even when a passkey remains', async () => {
    const { service, notifier } = makeService();
    // The scenario from A25: passkey registered, TOTP still active.
    await expect(service.disable(superAdmin, defaultAccountSecurityPolicy, '123456')).rejects.toThrow(
      new AccountSecurityError('MFA_REQUIRED_CANNOT_DISABLE'),
    );
    expect(notifier.audit).not.toHaveBeenCalled();
    expect(notifier.notify).not.toHaveBeenCalled();
  });
});
