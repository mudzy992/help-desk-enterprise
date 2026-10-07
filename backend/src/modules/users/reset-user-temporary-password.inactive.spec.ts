jest.mock(
  './issue-temporary-password-for-user',
  () => ({ issueTemporaryPasswordForUser: jest.fn() }),
);
jest.mock(
  './record-user-change',
  () => ({ recordUserChange: jest.fn().mockResolvedValue(undefined) }),
  { virtual: true },
);
jest.mock('./list-users-summary', () => ({ listUsersSummary: jest.fn() }));

import { issueTemporaryPasswordForUser } from './issue-temporary-password-for-user';
import { resetUserTemporaryPassword } from './reset-user-temporary-password';

describe('resetUserTemporaryPassword inactive-user handling (5.2.1 M3 B6)', () => {
  it('returns USER_INACTIVE without issuing or persisting a temporary password', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-inactive',
          email: 'inactive@example.test',
          displayName: 'Inactive User',
          isActive: false,
          isLocalOnly: true,
        }),
      },
    };

    await expect(
      resetUserTemporaryPassword(prisma as never, 'user-inactive', {
        settingsService: {} as never,
        mailTransport: { send: jest.fn() } as never,
      }),
    ).rejects.toMatchObject({ code: 'USER_INACTIVE' });

    expect(issueTemporaryPasswordForUser).not.toHaveBeenCalled();
  });
});
