import { hashLocalPassword } from '../authentication/hash-local-password';
import { InstallSuperAdminError } from './install-super-admin.error';
import {
  describeInstallPasswordPolicy,
  installSuperAdminDefaultPasswordPolicy,
  toInstallPasswordPolicy,
} from './install-super-admin-password-policy';
import { validateInstallSuperAdminCredentials } from './validate-install-super-admin-credentials';

/*
  Paket 5.1 (M1 #1): the founder account used to be checked only for length
  (12–128), a non-blank character and `password !== email`, so `password12345`
  was accepted for the most privileged account while every other local account
  had to pass the account-security policy.
*/
describe('validateInstallSuperAdminCredentials (password policy)', () => {
  const credentials = {
    email: 'admin@example.com',
    displayName: 'Direkcija IKT',
    password: 'correct-horse-battery',
  };

  it('accepts a strong password under the default policy', () => {
    expect(validateInstallSuperAdminCredentials(credentials)).toEqual({
      email: 'admin@example.com',
      displayName: 'Direkcija IKT',
      password: 'correct-horse-battery',
    });
  });

  it('refuses a common password and says which rule failed', () => {
    const attempt = { ...credentials, password: 'password12345' };
    try {
      validateInstallSuperAdminCredentials(attempt);
      throw new Error('expected the common password to be refused');
    } catch (error) {
      expect(error).toBeInstanceOf(InstallSuperAdminError);
      const failure = error as InstallSuperAdminError;
      expect(failure.code).toBe('PASSWORD_POLICY_VIOLATIONS');
      expect(failure.violations).toContain('COMMON_PASSWORD');
    }
  });

  it('refuses a password shorter than the configured minimum', () => {
    const policy = { ...installSuperAdminDefaultPasswordPolicy, minLength: 20 };
    expect(() =>
      validateInstallSuperAdminCredentials(
        { ...credentials, password: 'Vrlo-kratka-2026' },
        policy,
      ),
    ).toThrow(expect.objectContaining({ code: 'PASSWORD_POLICY_VIOLATIONS', violations: ['TOO_SHORT'] }));
  });

  it('refuses a password built from the account e-mail', () => {
    expect(() =>
      validateInstallSuperAdminCredentials({
        ...credentials,
        password: 'Direkcija.admin2026!',
      }),
    ).toThrow(expect.objectContaining({ violations: ['CONTAINS_EMAIL_NAME'] }));
  });

  it('refuses a password with an organisation word when the blocklist is on', () => {
    const policy = toInstallPasswordPolicy({
      ...defaultPolicy(),
      passwordOrganisationWords: ['direkcija'],
    });
    expect(() =>
      validateInstallSuperAdminCredentials(
        { ...credentials, password: 'Direkcija-bezbedno-2026' },
        policy,
      ),
    ).toThrow(expect.objectContaining({ violations: ['CONTAINS_ORGANISATION_WORD'] }));
  });

  it('skips the blocklist when the policy has it turned off', () => {
    const policy = { ...installSuperAdminDefaultPasswordPolicy, blocklistEnabled: false };
    expect(
      validateInstallSuperAdminCredentials(
        { ...credentials, password: 'password12345' },
        policy,
      ).password,
    ).toBe('password12345');
  });

  it('keeps the structural checks in place (e-mail, display name, blank password)', () => {
    expect(() =>
      validateInstallSuperAdminCredentials({ ...credentials, email: 'not-an-email' }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_SUPER_ADMIN_CREDENTIALS' }));
    expect(() =>
      validateInstallSuperAdminCredentials({ ...credentials, displayName: '  ' }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_SUPER_ADMIN_CREDENTIALS' }));
    expect(() =>
      validateInstallSuperAdminCredentials({ ...credentials, password: '            ' }),
    ).toThrow(expect.objectContaining({ violations: ['BLANK'] }));
  });

  it('never gets weaker than the shipped defaults, whatever settings say', () => {
    const policy = toInstallPasswordPolicy({
      ...defaultPolicy(),
      passwordMinLength: 4,
      passwordMaxLength: 4096,
    });
    expect(policy.minLength).toBe(12);
    expect(policy.maxLength).toBe(128);
  });

  it('publishes only the rules, never a secret', () => {
    const described = describeInstallPasswordPolicy(installSuperAdminDefaultPasswordPolicy);
    expect(described).toEqual({ minLength: 12, maxLength: 128, blocklistEnabled: true });
    expect(JSON.stringify(described)).not.toContain('password');
  });

  it('hashes what it accepted (the callers rely on the hash, not the plain text)', async () => {
    const validated = validateInstallSuperAdminCredentials(credentials);
    const hash = await hashLocalPassword(validated.password, 4);
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(hash).not.toContain(validated.password);
  });
});

function defaultPolicy() {
  return {
    mfaRequiredForAdmins: true,
    mfaAllowOptional: true,
    mfaIssuerName: 'Help Desk',
    passwordMinLength: 12,
    passwordMaxLength: 128,
    passwordBlocklistEnabled: true,
    passwordOrganisationWords: [],
    passwordHistoryCount: 5,
    passwordMaxAgeDays: 0,
    superAdminPasswordMaxAgeDays: 365,
    sessionsMaxPerUser: 0,
    sessionsNewDeviceAlert: true,
  } as const;
}
