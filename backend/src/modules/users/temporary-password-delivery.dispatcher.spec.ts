import { sendTemporaryPasswordEmail } from './send-temporary-password-email';
import { prepareTemporaryPassword } from './issue-temporary-password-for-user';
import { TemporaryPasswordDeliveryDispatcher } from './temporary-password-delivery.dispatcher';
import { toTemporaryPasswordDeliveryPayload } from './temporary-password-delivery.outbox';

jest.mock('./send-temporary-password-email', () => ({
  sendTemporaryPasswordEmail: jest.fn().mockResolvedValue(true),
}));

jest.mock('./issue-temporary-password-for-user', () => ({
  prepareTemporaryPassword: jest.fn().mockResolvedValue({
    temporaryPassword: 'Issued!23456',
    localPasswordHash: 'hash-issued',
  }),
}));

/*
  W2.26 (`BA-users-02`): the worker is the only place an e-mail-channel credential is
  issued. What it must guarantee:

    * the password is written and mailed in that order, once;
    * a failed mail leaves **no** usable password behind (the credential is rolled
      back, so "has a password" keeps meaning "somebody was told it");
    * it never overwrites a credential an admin already reset;
    * a closed account gets nothing, and a corrupt row dead-letters loudly.
*/
type Delivery = { readonly id: string; readonly payload: Record<string, unknown> };

function harness(options: { user?: Record<string, unknown> | null } = {}) {
  const user = options.user === undefined ? { id: 'user-1', isActive: true, localPasswordHash: null } : options.user;
  const updateMany = jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
    where.localPasswordHash === null ? { count: 1 } : { count: 1 },
  );
  const prisma = {
    user: {
      findUnique: jest.fn(async () => user),
      updateMany,
    },
  };
  const results: ('idle' | 'succeeded' | 'retry' | 'dead-letter')[] = [];
  const deliveries: Delivery[] = [];
  const outbox = {
    dispatchOne: jest.fn(
      async (_topic: string, run: (delivery: Delivery) => Promise<void>) => {
        const next = results.shift() ?? 'idle';
        if (next === 'idle') return 'idle';
        const delivery = deliveries.shift();
        if (delivery === undefined) return 'idle';
        if (next === 'succeeded') {
          await run(delivery);
          return 'succeeded';
        }
        try {
          await run(delivery);
          return next;
        } catch {
          return next;
        }
      },
    ),
  };
  const dispatcher = new TemporaryPasswordDeliveryDispatcher(
    outbox as never,
    prisma as never,
    {} as never,
    { send: jest.fn() } as never,
    undefined,
  );
  return { dispatcher, prisma, outbox, updateMany, results, deliveries };
}

const intent = toTemporaryPasswordDeliveryPayload({
  userId: 'user-1',
  email: 'user@example.com',
  displayName: 'Test User',
}) as Record<string, unknown>;

describe('TemporaryPasswordDeliveryDispatcher', () => {
  beforeEach(() => {
    jest.mocked(sendTemporaryPasswordEmail).mockReset();
    jest.mocked(sendTemporaryPasswordEmail).mockResolvedValue(true);
    jest.mocked(prepareTemporaryPassword).mockClear();
  });

  it('issues the credential, stores the hash, then mails it', async () => {
    const test = harness();
    test.results.push('succeeded');
    test.deliveries.push({ id: 'outbox-1', payload: intent });

    await expect(test.dispatcher.drain(5)).resolves.toBe(1);

    expect(prepareTemporaryPassword).toHaveBeenCalledTimes(1);
    expect(test.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', isActive: true, localPasswordHash: null },
      data: { localPasswordHash: 'hash-issued', mustChangePassword: true, isLocalOnly: true },
    });
    expect(sendTemporaryPasswordEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        toAddress: 'user@example.com',
        displayName: 'Test User',
        temporaryPassword: 'Issued!23456',
      }),
    );
    // The stored hash is written before the mail leaves.
    expect(test.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(sendTemporaryPasswordEmail).mock.invocationCallOrder[0]!,
    );
  });

  it('leaves no usable password when the mail cannot be sent', async () => {
    const test = harness();
    jest.mocked(sendTemporaryPasswordEmail).mockResolvedValueOnce(false);
    test.results.push('retry');
    test.deliveries.push({ id: 'outbox-1', payload: intent });

    await expect(test.dispatcher.drain(5)).resolves.toBe(0);

    // Write, failed send, rollback: the account is not left with a password nobody has.
    expect(test.updateMany).toHaveBeenCalledTimes(2);
    expect(test.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'user-1', localPasswordHash: 'hash-issued' },
      data: { localPasswordHash: null },
    });
  });

  it('never overwrites a credential an administrator already reset', async () => {
    const test = harness({
      user: { id: 'user-1', isActive: true, localPasswordHash: 'existing-hash' },
    });
    test.results.push('succeeded');
    test.deliveries.push({ id: 'outbox-1', payload: intent });

    await expect(test.dispatcher.drain(5)).resolves.toBe(0);

    expect(prepareTemporaryPassword).not.toHaveBeenCalled();
    expect(test.updateMany).not.toHaveBeenCalled();
    expect(sendTemporaryPasswordEmail).not.toHaveBeenCalled();
  });

  it('sends nothing for a deleted or deactivated account', async () => {
    const inactive = harness({
      user: { id: 'user-1', isActive: false, localPasswordHash: null },
    });
    inactive.results.push('succeeded');
    inactive.deliveries.push({ id: 'outbox-1', payload: intent });
    await inactive.dispatcher.drain(5);

    const missing = harness({ user: null });
    missing.results.push('succeeded');
    missing.deliveries.push({ id: 'outbox-1', payload: intent });
    await missing.dispatcher.drain(5);

    expect(sendTemporaryPasswordEmail).not.toHaveBeenCalled();
    expect(prepareTemporaryPassword).not.toHaveBeenCalled();
  });

  it('stops when the claim was taken concurrently', async () => {
    const test = harness();
    test.updateMany.mockResolvedValueOnce({ count: 0 });
    test.results.push('succeeded');
    test.deliveries.push({ id: 'outbox-1', payload: intent });

    await expect(test.dispatcher.drain(5)).resolves.toBe(0);
    expect(sendTemporaryPasswordEmail).not.toHaveBeenCalled();
  });

  it('dead-letters a corrupt intent without mailing anything', async () => {
    const test = harness();
    const warn = jest.spyOn(test.dispatcher['logger'], 'warn').mockImplementation(() => undefined);
    test.results.push('dead-letter');
    test.deliveries.push({ id: 'outbox-1', payload: { userId: 'user-1' } });

    await test.dispatcher.drain(5);

    expect(sendTemporaryPasswordEmail).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('temporary_password_delivery_dead_letter'),
    );
  });

  it('stops as soon as the topic is idle', async () => {
    const test = harness();
    await expect(test.dispatcher.drain(10)).resolves.toBe(0);
    expect(test.outbox.dispatchOne).toHaveBeenCalledTimes(1);
  });
});
