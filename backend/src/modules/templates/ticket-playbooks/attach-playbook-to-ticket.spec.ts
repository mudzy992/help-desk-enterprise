import { findUniqueAutoAttachPlaybook, loadPlaybookCandidates } from './attach-playbook-to-ticket';

type CandidatePrisma = {
  readonly playbook: {
    readonly count: jest.Mock;
    readonly findFirst: jest.Mock;
    readonly findMany: jest.Mock;
  };
};

function createPrisma(): CandidatePrisma {
  return {
    playbook: {
      count: jest.fn(async () => 0),
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
    },
  };
}

describe('findUniqueAutoAttachPlaybook', () => {
  it('does not infer uniqueness from a limited page when service candidates are ambiguous', async () => {
    const prisma = createPrisma();
    prisma.playbook.count.mockResolvedValueOnce(1001);

    await expect(
      findUniqueAutoAttachPlaybook(prisma as never, {
        serviceId: 'service-1',
        categoryId: 'category-1',
      }),
    ).resolves.toBeNull();
    expect(prisma.playbook.count).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        isActive: true,
        services: { some: { serviceId: 'service-1' } },
      },
    });
    expect(prisma.playbook.findFirst).not.toHaveBeenCalled();
    expect(prisma.playbook.count).toHaveBeenCalledTimes(1);
  });

  it('prefers one service-scoped candidate over category-scoped candidates', async () => {
    const prisma = createPrisma();
    prisma.playbook.count.mockResolvedValueOnce(1);
    prisma.playbook.findFirst.mockResolvedValueOnce({ id: 'service-playbook' });

    await expect(
      findUniqueAutoAttachPlaybook(prisma as never, {
        serviceId: 'service-1',
        categoryId: 'category-1',
      }),
    ).resolves.toEqual({ id: 'service-playbook' });
    expect(prisma.playbook.count).toHaveBeenCalledTimes(1);
    expect(prisma.playbook.findFirst).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        isActive: true,
        services: { some: { serviceId: 'service-1' } },
      },
      select: { id: true },
    });
  });

  it('checks category candidates only when the service tier is empty and requires exactly one', async () => {
    const prisma = createPrisma();
    prisma.playbook.count.mockResolvedValueOnce(0).mockResolvedValueOnce(2);

    await expect(
      findUniqueAutoAttachPlaybook(prisma as never, {
        serviceId: 'service-1',
        categoryId: 'category-1',
      }),
    ).resolves.toBeNull();
    expect(prisma.playbook.count).toHaveBeenNthCalledWith(2, {
      where: {
        deletedAt: null,
        isActive: true,
        categories: { some: { categoryId: 'category-1' } },
      },
    });
    expect(prisma.playbook.findFirst).not.toHaveBeenCalled();
  });

  it('returns no candidate without querying category scope when the ticket has no category', async () => {
    const prisma = createPrisma();
    prisma.playbook.count.mockResolvedValueOnce(0);

    await expect(
      findUniqueAutoAttachPlaybook(prisma as never, {
        serviceId: 'service-1',
        categoryId: null,
      }),
    ).resolves.toBeNull();
    expect(prisma.playbook.count).toHaveBeenCalledTimes(1);
  });
});

describe('loadPlaybookCandidates', () => {
  it('continues the stable service tier after its name/id cursor', async () => {
    const prisma = createPrisma();
    prisma.playbook.findMany.mockResolvedValueOnce([
      { id: 'playbook-a', name: 'A service' },
      { id: 'playbook-b', name: 'B service' },
      { id: 'playbook-c', name: 'C service' },
    ]);
    const ticket = {
      ticketId: 'ticket-1',
      serviceId: 'service-1',
      categoryId: 'category-1',
    };

    const first = await loadPlaybookCandidates(prisma as never, ticket, {
      take: 2,
    });
    expect(first.items.map((item) => item.id)).toEqual(['playbook-a', 'playbook-b']);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).not.toBeNull();
    expect(prisma.playbook.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        deletedAt: null,
        isActive: true,
        services: { some: { serviceId: 'service-1' } },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 3,
    });

    prisma.playbook.findMany.mockReset();
    prisma.playbook.findMany.mockResolvedValueOnce([{ id: 'playbook-c', name: 'C service' }]);
    prisma.playbook.findMany.mockResolvedValue([]);
    const second = await loadPlaybookCandidates(prisma as never, ticket, {
      take: 2,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.items.map((item) => item.id)).toEqual(['playbook-c']);
    expect(second.items[0]?.match).toBe('service');
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeNull();
    expect(prisma.playbook.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        AND: [
          {
            deletedAt: null,
            isActive: true,
            services: { some: { serviceId: 'service-1' } },
          },
          {
            OR: [{ name: { gt: 'B service' } }, { name: 'B service', id: { gt: 'playbook-b' } }],
          },
        ],
      },
    });
  });
});
