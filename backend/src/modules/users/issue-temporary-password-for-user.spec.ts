import { hashLocalPassword } from '../authentication/hash-local-password';
import { issueTemporaryPasswordForUser } from './issue-temporary-password-for-user';

jest.mock('../authentication/hash-local-password', () => ({
  hashLocalPassword: jest.fn().mockResolvedValue('$2b$04$issued-hash'),
}));

jest.mock('./send-temporary-password-email', () => ({
  sendTemporaryPasswordEmail: jest.fn().mockResolvedValue(false),
}));

import { sendTemporaryPasswordEmail } from './send-temporary-password-email';

describe('issueTemporaryPasswordForUser', () => {
  it('always persists a non-null localPasswordHash and mustChangePassword', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = { user: { update } };
    const issued = await issueTemporaryPasswordForUser({
      prisma: prisma as never,
      settingsService: {} as never,
      mailTransport: { send: jest.fn() } as never,
      userId: 'user-1',
      email: 'user@example.com',
      displayName: 'Test User',
    });
    expect(hashLocalPassword).toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        localPasswordHash: '$2b$04$issued-hash',
        mustChangePassword: true,
        isLocalOnly: true,
      },
    });
    expect(issued.temporaryPasswordDelivery).toBe('ui');
    expect(issued.temporaryPassword).toEqual(expect.any(String));
    expect(sendTemporaryPasswordEmail).toHaveBeenCalled();
  });
});
