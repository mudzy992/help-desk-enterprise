import { AccountSecurityError } from './account-security.error';
import { PasswordChangeService } from './password-change.service';

/*
  Paket 5.4.0-d (M5): both owner-set flows — the voluntary change and the
  forced/must-change screen — go through `assertAcceptable`, so the Pwned
  Passwords verdict is enforced in exactly one place. These tests pin the order
  (offline rules and history first, network last, and the generator's
  backwards-compatible wiring) and the mapping to the structured violation.
*/

jest.mock('../hash-local-password', () => ({
  hashLocalPassword: jest.fn().mockResolvedValue('$2b$04$hash'),
}));

jest.mock('../verify-local-password', () => ({
  verifyLocalPassword: jest.fn().mockResolvedValue(false),
}));

import { verifyLocalPassword } from '../verify-local-password';

describe('PasswordChangeService Pwned Passwords check', () => {
  const defaultPolicy = {
    passwordMinLength: 12,
    passwordMaxLength: 128,
    passwordBlocklistEnabled: false,
    passwordHistoryCount: 0,
    passwordOrganisationWords: [] as string[],
  };
  const findUnique = jest.fn();
  const historyFindMany = jest.fn();
  const loadPolicy = jest.fn();

  function createService(check?: (password: string) => Promise<string>) {
    const service = new PasswordChangeService(
      {
        user: { findUnique },
        userPasswordHistory: { findMany: historyFindMany },
      } as never,
      { load: loadPolicy } as never,
      { audit: jest.fn(), notify: jest.fn() } as never,
      check === undefined ? undefined : ({ check } as never),
    );
    return service;
  }

  beforeEach(() => {
    findUnique.mockReset().mockResolvedValue({ localPasswordHash: '$2b$04$old' });
    historyFindMany.mockReset().mockResolvedValue([]);
    loadPolicy.mockReset().mockResolvedValue(defaultPolicy);
    jest.mocked(verifyLocalPassword).mockReset().mockResolvedValue(false);
  });

  it('rejects a compromised password with the structured PWNED_PASSWORD violation', async () => {
    const check = jest.fn().mockResolvedValue('pwned');

    await expect(
      createService(check).assertAcceptable('user-1', 'user@corp.test', 'Str0ng-But-Breached!'),
    ).rejects.toMatchObject({
      code: 'INVALID_PASSWORD',
      violations: ['PWNED_PASSWORD'],
    });
    expect(check).toHaveBeenCalledWith('Str0ng-But-Breached!');
  });

  it('accepts a clean answer and an unavailable service alike (fail-open)', async () => {
    const clean = jest.fn().mockResolvedValue('clean');
    await expect(
      createService(clean).assertAcceptable('user-1', 'user@corp.test', 'Unique-Passw0rd-42'),
    ).resolves.toBeUndefined();

    const unavailable = jest.fn().mockResolvedValue('unavailable');
    await expect(
      createService(unavailable).assertAcceptable(
        'user-1',
        'user@corp.test',
        'Unique-Passw0rd-43',
      ),
    ).resolves.toBeUndefined();
  });

  it('never asks the network about a password the offline rules already refused', async () => {
    const check = jest.fn().mockResolvedValue('clean');

    await expect(
      createService(check).assertAcceptable('user-1', 'user@corp.test', 'short'),
    ).rejects.toBeInstanceOf(AccountSecurityError);
    expect(check).not.toHaveBeenCalled();
  });

  it('never asks the network about a password reused from history', async () => {
    loadPolicy.mockResolvedValue({ ...defaultPolicy, passwordHistoryCount: 3 });
    jest.mocked(verifyLocalPassword).mockResolvedValue(true);
    const check = jest.fn().mockResolvedValue('clean');

    await expect(
      createService(check).assertAcceptable('user-1', 'user@corp.test', 'Reused-Passw0rd-1'),
    ).rejects.toMatchObject({ code: 'PASSWORD_REUSED' });
    expect(check).not.toHaveBeenCalled();
  });

  it('works without a checker (backwards-compatible wiring)', async () => {
    await expect(
      createService().assertAcceptable('user-1', 'user@corp.test', 'Unique-Passw0rd-44'),
    ).resolves.toBeUndefined();
  });
});
