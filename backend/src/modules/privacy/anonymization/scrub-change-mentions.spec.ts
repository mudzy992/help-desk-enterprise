import { scrubChangeMentions } from './scrub-change-mentions';
import { changeMentionTokens, changeMentionWhere } from './change-mentions';
import { createTextScrubber } from './text-scrubber';

/*
  BA-changes-17: the change part of an anonymisation. Five readers of change
  content are covered — the change itself, the CAB vote comments, the event
  JSON, the in-app notification and the calendar window the change wrote into
  service-catalog. The person is found even when they are only named in
  somebody else's change.
*/
describe('scrubChangeMentions', () => {
  const identifiers = {
    displayName: 'Amra Hodžić',
    email: 'amra.hodzic@example.com',
    logins: ['ahodzic'],
  };
  const replacement = 'Bivši korisnik #AAAA';

  type Change = Record<string, unknown> & { id: string };

  function change(overrides: Partial<Change> = {}): Change {
    return {
      id: 'c1',
      title: 'CHG-1 · CRM restart',
      description: 'Dogovoreno sa Amra Hodžić.',
      reason: null,
      implementationPlan: 'Amra Hodžić restartuje servis.',
      backoutPlan: null,
      testPlan: null,
      communicationPlan: null,
      reviewNotes: null,
      cancelReason: null,
      ...overrides,
    };
  }

  function fakePrisma(overrides: Record<string, unknown> = {}) {
    const state = {
      changes: [change()],
      votes: [{ id: 'v1', comment: 'amra.hodzic@example.com je za.' }],
      eventsByActor: [{ id: 'e1' }],
      eventsByChange: [{ id: 'e1' }, { id: 'e2' }],
      mentionedEvents: [{ id: 'e2' }, { id: 'e3' }],
      eventRows: [
        { id: 'e1', detail: { note: 'Amra Hodžić pokrenuo' } },
        { id: 'e2', detail: { note: 'bez teksta' } },
        { id: 'e3', detail: { by: 'ahodzic' } },
      ],
      notifications: [
        { id: 'n1', title: 'changes.notification.created', body: 'Amra Hodžić', payload: { changeId: 'c1' } },
      ],
      windows: [{ id: 'w1', message: 'CHG-1 · CRM restart za Amra Hodžić' }],
      changeLogs: [
        {
          id: 'l1',
          reason: 'downtime_window_create',
          diff: { action: 'downtime_window_create', after: { message: 'CHG-1 · CRM restart za Amra Hodžić' } },
        },
      ],
      ...overrides,
    };

    const prisma = {
      changeRequest: {
        findMany: jest.fn().mockResolvedValue(state.changes),
        update: jest.fn().mockResolvedValue({}),
      },
      changeApproval: {
        findMany: jest.fn().mockResolvedValue(state.votes),
        update: jest.fn().mockResolvedValue({}),
      },
      changeEvent: {
        findMany: jest.fn().mockImplementation((args: { where?: Record<string, unknown> }) => {
          const where = args.where ?? {};
          if (where.id !== undefined) {
            const wanted = (where.id as { in: string[] }).in;
            return Promise.resolve(state.eventRows.filter((row) => wanted.includes(row.id)));
          }
          if (where.actorUserId !== undefined) return Promise.resolve(state.eventsByActor);
          return Promise.resolve(state.eventsByChange);
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      notification: {
        findMany: jest.fn().mockResolvedValue(state.notifications),
        update: jest.fn().mockResolvedValue({}),
      },
      serviceDowntimeWindow: {
        findMany: jest.fn().mockResolvedValue(state.windows),
        update: jest.fn().mockResolvedValue({}),
      },
      changeLog: {
        findMany: jest.fn().mockResolvedValue(state.changeLogs),
        update: jest.fn().mockResolvedValue({}),
      },
      $queryRaw: jest.fn().mockResolvedValue(state.mentionedEvents),
    };
    return prisma;
  }

  const run = (prisma: ReturnType<typeof fakePrisma>, ids = identifiers) =>
    scrubChangeMentions({
      prisma: prisma as never,
      userId: 'u1',
      scrubber: createTextScrubber(ids, replacement),
    });

  it('selects a change the person is only named in, and scrubs its text', async () => {
    const prisma = fakePrisma();
    const counts = await run(prisma);

    const [call] = prisma.changeRequest.findMany.mock.calls[0] as [{ where: Record<string, unknown> }];
    // Requester, owner, or a mention in one of the nine text columns.
    expect(call.where).toEqual({
      OR: [{ requesterUserId: 'u1' }, { ownerUserId: 'u1' }, changeMentionWhere(changeMentionTokens(identifiers))],
    });
    const [update] = prisma.changeRequest.update.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(update.data).toEqual({
      description: `Dogovoreno sa ${replacement}.`,
      implementationPlan: `${replacement} restartuje servis.`,
    });
    expect(counts.changes).toBe(1);
  });

  it('scrubs the CAB vote comments of the person and of their changes', async () => {
    const prisma = fakePrisma();
    const counts = await run(prisma);

    const [call] = prisma.changeApproval.findMany.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(call.where).toEqual({
      comment: { not: null },
      OR: [{ approverUserId: 'u1' }, { changeId: { in: ['c1'] } }],
    });
    expect(prisma.changeApproval.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { comment: `${replacement} je za.` },
    });
    expect(counts.changeVotes).toBe(1);
  });

  it('scrubs the events of their changes, their own events and mentioned ones once each', async () => {
    const prisma = fakePrisma();
    const counts = await run(prisma);

    const byIds = prisma.changeEvent.findMany.mock.calls.find(
      (args) => ((args as [{ where: Record<string, unknown> }])[0].where.id as { in: string[] } | undefined) !== undefined,
    ) as [{ where: { id: { in: string[] } } }];
    expect(byIds[0].where.id.in.sort()).toEqual(['e1', 'e2', 'e3']);
    // Only the two with a replacement are written; the clean one is untouched.
    expect(prisma.changeEvent.update).toHaveBeenCalledTimes(2);
    expect(prisma.changeEvent.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { detail: { note: `${replacement} pokrenuo` } },
    });
    expect(prisma.changeEvent.update).toHaveBeenCalledWith({
      where: { id: 'e3' },
      data: { detail: { by: replacement } },
    });
    expect(counts.changeEvents).toBe(2);
  });

  it('empties the in-app copies that point at the change', async () => {
    const prisma = fakePrisma();
    const counts = await run(prisma);

    const [call] = prisma.notification.findMany.mock.calls[0] as [{ where: { OR: unknown[] } }];
    expect(call.where.OR).toEqual([{ payload: { path: ['changeId'], equals: 'c1' } }]);
    // The title is a translation key and the payload holds ids only, so the
    // deep link survives; only the text goes.
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { title: 'changes.notification.created', body: replacement },
    });
    expect(counts.changeNotifications).toBe(1);
  });

  it('scrubs the calendar window that copied the change number and title', async () => {
    const prisma = fakePrisma();
    const counts = await run(prisma);

    const [call] = prisma.serviceDowntimeWindow.findMany.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(call.where).toEqual({
      OR: [
        { changeRequestId: { in: ['c1'] } },
        { OR: changeMentionTokens(identifiers).map((token) => ({ message: { contains: token, mode: 'insensitive' } })) },
      ],
    });
    expect(prisma.serviceDowntimeWindow.update).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: { message: `CHG-1 · CRM restart za ${replacement}` },
    });
    expect(counts.downtimeWindows).toBe(1);
  });

  it('scrubs the service-catalogue change log of the same window', async () => {
    const prisma = fakePrisma();
    const counts = await run(prisma);

    // The change log of a downtime window keeps the same `number · title` in
    // `diff.after.message` - a third reader of the replica.
    const [call] = prisma.changeLog.findMany.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(call.where).toEqual({ entityType: 'service_downtime_window', entityId: { in: ['w1'] } });
    const [update] = prisma.changeLog.update.mock.calls[0] as [{ where: { id: string }; data: Record<string, unknown> }];
    expect(update.where).toEqual({ id: 'l1' });
    expect(update.data).toEqual({
      reason: 'downtime_window_create',
      diff: { action: 'downtime_window_create', after: { message: `CHG-1 · CRM restart za ${replacement}` } },
    });
    expect(counts.changeLogs).toBe(1);
  });

  it('reports zeros and writes nothing when no text matches', async () => {
    const prisma = fakePrisma({ changes: [], votes: [], notifications: [], windows: [], mentionedEvents: [] });
    const counts = await run(prisma, { displayName: '', email: '', logins: [] });

    // No replaceable token: nothing is written even though the rows are there.
    expect(counts).toEqual({
      changes: 0,
      changeEvents: 0,
      changeVotes: 0,
      changeNotifications: 0,
      downtimeWindows: 0,
      changeLogs: 0,
    });
    const [call] = prisma.changeRequest.findMany.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect((call.where.OR as unknown[])[2]).toEqual({ id: { in: [] } });
    expect(prisma.changeRequest.update).not.toHaveBeenCalled();
    expect(prisma.notification.update).not.toHaveBeenCalled();
    expect(prisma.serviceDowntimeWindow.update).not.toHaveBeenCalled();
    expect(prisma.changeLog.update).not.toHaveBeenCalled();
  });
});
