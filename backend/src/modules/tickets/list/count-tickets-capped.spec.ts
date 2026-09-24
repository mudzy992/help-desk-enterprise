import { countTicketsCapped } from './count-tickets-capped';

function fakePrisma(matching: number) {
  const count = jest.fn(async ({ take }: { take?: number }) =>
    take === undefined ? matching : Math.min(matching, take),
  );
  return { prisma: { ticket: { count } }, count };
}

describe('countTicketsCapped', () => {
  it('reports the exact total below the cap', async () => {
    const { prisma, count } = fakePrisma(42);
    await expect(countTicketsCapped(prisma, {}, 100)).resolves.toEqual({
      total: 42,
      totalIsCapped: false,
    });
    expect(count).toHaveBeenCalledWith({ where: {}, take: 101 });
  });

  it('treats exactly the cap as exact', async () => {
    const { prisma } = fakePrisma(100);
    await expect(countTicketsCapped(prisma, {}, 100)).resolves.toEqual({
      total: 100,
      totalIsCapped: false,
    });
  });

  it('stops at the cap and flags it', async () => {
    const { prisma } = fakePrisma(100_000);
    await expect(countTicketsCapped(prisma, {}, 100)).resolves.toEqual({
      total: 100,
      totalIsCapped: true,
    });
  });
});
