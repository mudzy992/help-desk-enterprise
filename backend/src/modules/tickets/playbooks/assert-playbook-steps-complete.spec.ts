import type { PrismaService } from '../../../common/prisma/prisma.service';
import { TicketsError } from '../tickets.error';
import { assertPlaybookStepsComplete, isPlaybookGuardedTransition } from './assert-playbook-steps-complete';

const snapshot = [
  { stepKey: 'a', title: 'Provjeri VPN', required: true },
  { stepKey: 'b', title: 'Opcionalno', required: false },
];

function prismaWith(rows: unknown[]) {
  const findMany = jest.fn().mockResolvedValue(rows);
  return { prisma: { ticketPlaybook: { findMany } } as unknown as PrismaService, findMany };
}

describe('isPlaybookGuardedTransition', () => {
  it('guards resolving and closing except from RESOLVED', () => {
    expect(isPlaybookGuardedTransition('IN_PROGRESS', 'RESOLVED')).toBe(true);
    expect(isPlaybookGuardedTransition('WAITING_FOR_USER', 'CLOSED')).toBe(true);
    expect(isPlaybookGuardedTransition('RESOLVED', 'CLOSED')).toBe(false);
    expect(isPlaybookGuardedTransition('RESOLVED', 'RESOLVED')).toBe(false);
    expect(isPlaybookGuardedTransition('ASSIGNED', 'IN_PROGRESS')).toBe(false);
  });
});

describe('assertPlaybookStepsComplete', () => {
  it('never queries outside block mode', async () => {
    const { prisma, findMany } = prismaWith([]);
    await assertPlaybookStepsComplete({ prisma, mode: 'warn', tickets: [{ id: 't', from: 'IN_PROGRESS' }], to: 'RESOLVED' });
    await assertPlaybookStepsComplete({ prisma, mode: undefined, tickets: [{ id: 't', from: 'IN_PROGRESS' }], to: 'RESOLVED' });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('skips unguarded transitions', async () => {
    const { prisma, findMany } = prismaWith([]);
    await assertPlaybookStepsComplete({ prisma, mode: 'block', tickets: [{ id: 't', from: 'RESOLVED' }], to: 'CLOSED' });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('blocks while required steps are open, with details', async () => {
    const { prisma } = prismaWith([{ ticketId: 't', stepsSnapshot: snapshot, steps: [{ stepKey: 'b' }] }]);
    const promise = assertPlaybookStepsComplete({
      prisma,
      mode: 'block',
      tickets: [{ id: 't', ticketNumber: 'HD-1', from: 'IN_PROGRESS' }],
      to: 'RESOLVED',
    });
    await expect(promise).rejects.toBeInstanceOf(TicketsError);
    await promise.catch((error: TicketsError) => {
      expect(error.code).toBe('PLAYBOOK_REQUIRED_STEPS_OPEN');
      expect(error.details).toEqual({ tickets: [{ ticketId: 't', ticketNumber: 'HD-1', steps: ['Provjeri VPN'] }] });
    });
  });

  it('passes when required steps are done', async () => {
    const { prisma } = prismaWith([{ ticketId: 't', stepsSnapshot: snapshot, steps: [{ stepKey: 'a' }] }]);
    await expect(
      assertPlaybookStepsComplete({ prisma, mode: 'block', tickets: [{ id: 't', from: 'IN_PROGRESS' }], to: 'RESOLVED' }),
    ).resolves.toBeUndefined();
  });
});
