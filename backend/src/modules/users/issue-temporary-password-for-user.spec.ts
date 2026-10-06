import { hashLocalPassword } from '../authentication/hash-local-password';
import { issueTemporaryPasswordForUser } from './issue-temporary-password-for-user';

jest.mock('../authentication/hash-local-password', () => ({
  hashLocalPassword: jest.fn().mockResolvedValue('$2b$04$issued-hash'),
}));

jest.mock('./record-user-change', () => ({
  recordUserChange: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./send-temporary-password-email', () => ({
  sendTemporaryPasswordEmail: jest.fn().mockResolvedValue(false),
}));

import { sendTemporaryPasswordEmail } from './send-temporary-password-email';
import { recordUserChange } from './record-user-change';

describe('issueTemporaryPasswordForUser', () => {
  it('always persists a non-null localPasswordHash and mustChangePassword', async () => {
    const update = jest.fn().mockResolvedValue({});
    const transaction = { user: { update } };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<void>) => callback(transaction)),
    };
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

  it('rolls back a password reset when the audit insert fails', async () => {
    jest.mocked(sendTemporaryPasswordEmail).mockClear();
    const auditFailure = new Error('audit insert failed');
    let persisted = {
      localPasswordHash: 'old-hash',
      mustChangePassword: false,
      isLocalOnly: true,
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => {
        let staged = { ...persisted };
        const transaction = {
          user: {
            update: jest.fn(async ({ data }: { data: Partial<typeof persisted> }) => {
              staged = { ...staged, ...data };
              return staged;
            }),
          },
        };
        const result = await callback(transaction);
        persisted = staged;
        return result;
      }),
    };
    jest.mocked(recordUserChange).mockRejectedValueOnce(auditFailure);

    await expect(
      issueTemporaryPasswordForUser({
        prisma: prisma as never,
        settingsService: {} as never,
        mailTransport: { send: jest.fn() } as never,
        userId: 'user-1',
        email: 'user@example.com',
        displayName: 'Test User',
        audit: {
          action: 'user.password_reset',
          actorUserId: 'admin-1',
          requestId: 'req-failed',
          metadata: { reason: 'admin_reset', mustChangePassword: true },
        },
      }),
    ).rejects.toBe(auditFailure);
    expect(persisted).toEqual({
      localPasswordHash: 'old-hash',
      mustChangePassword: false,
      isLocalOnly: true,
    });
    expect(sendTemporaryPasswordEmail).not.toHaveBeenCalled();
  });

  it('writes successful reset audit metadata in the same password transaction without a secret', async () => {
    const transaction = { user: { update: jest.fn().mockResolvedValue({}) } };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<void>) => callback(transaction)),
    };
    await issueTemporaryPasswordForUser({
      prisma: prisma as never,
      settingsService: {} as never,
      mailTransport: { send: jest.fn() } as never,
      userId: 'user-1',
      email: 'user@example.com',
      displayName: 'Test User',
      audit: {
        action: 'user.password_reset',
        actorUserId: 'admin-1',
        requestId: 'req-1',
        metadata: { reason: 'admin_reset', mustChangePassword: true },
      },
    });
    expect(recordUserChange).toHaveBeenCalledWith(transaction, expect.objectContaining({
      action: 'user.password_reset',
      entityId: 'user-1',
      metadata: { reason: 'admin_reset', mustChangePassword: true },
    }));
    expect(JSON.stringify(jest.mocked(recordUserChange).mock.calls)).not.toContain('ResetPassword');
  });
});
