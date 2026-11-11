jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { Logger } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthorizationService } from '../authorization/authorization.service';
import { AnnouncementsService } from './announcements.service';

const now = new Date('2026-10-29T12:00:00.000Z');

function setup(input: { due: unknown[]; missed: unknown[] }) {
  const prisma = {
    announcement: {
      findMany: jest.fn(async (args: { where: { endsAt: Record<string, Date> } }) =>
        args.where.endsAt.lte !== undefined ? input.missed : input.due,
      ),
      findFirst: jest.fn(async () => null),
    },
    announcementAcknowledgement: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    announcementDismissal: { deleteMany: jest.fn(async () => ({ count: 0 })) },
  };
  const settings = { getSetting: jest.fn(async () => true) };
  const authorization = {
    authorizeResource: jest.fn(async () => ({ allowed: true, reason: 'GLOBAL_ASSIGNMENT_ALLOWED' as const })),
  } as unknown as AuthorizationService;
  const service = new AnnouncementsService(prisma as unknown as PrismaService, settings as never, authorization);
  const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  return { service, prisma, warn };
}

describe('AnnouncementsService sweep missed policy (BA-announcements-11)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('alarms recently missed announcements instead of distributing them late', async () => {
    const missed = [{ id: 'ann-missed', endsAt: new Date(now.getTime() - 60 * 60 * 1000) }];
    const { service, warn } = setup({ due: [], missed });
    const sent = await service.sweep(now);
    expect(sent).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('announcement_missed_distribution id=ann-missed'));
  });

  it('alarms when the due cap is reached, naming the oldest due announcement', async () => {
    const due = Array.from({ length: 20 }, (_, index) => ({
      id: `ann-${index}`,
      startsAt: new Date(now.getTime() - (20 - index) * 60_000),
    }));
    const { service, warn } = setup({ due, missed: [] });
    await service.sweep(now);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('announcement_sweep_due_cap_reached'));
  });
});
