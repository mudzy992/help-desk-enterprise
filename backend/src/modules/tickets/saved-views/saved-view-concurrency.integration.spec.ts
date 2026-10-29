import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import { createSavedView } from './create-saved-view';
import { updateSavedView } from './update-saved-view';
import type { TicketSavedViewsConfiguration } from './saved-views.types';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('saved-view owner concurrency invariants', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let userId: string;
  const stamp = Date.now();
  const configuration: TicketSavedViewsConfiguration = { enabled: true, maxPerUser: 3, allowDefaultView: true };

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    userId = (await prisma.user.create({ data: { email: `saved-view-${stamp}@example.test`, displayName: 'Saved view actor' } })).id;
  });
  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('enforces max count and one default under parallel creates/updates', async () => {
    const creates = await Promise.allSettled(
      Array.from({ length: 20 }, (_, index) => createSavedView({
        prisma: prisma as never,
        body: { name: `View ${index}`, filters: {}, columns: [], isDefault: false },
        context: { actorUserId: userId },
        configuration,
      })),
    );
    expect(creates.filter((result) => result.status === 'fulfilled')).toHaveLength(3);
    expect(await prisma.savedView.count({ where: { userId } })).toBe(3);

    const views = await prisma.savedView.findMany({ where: { userId } });
    const defaults = await Promise.allSettled(views.map((view) => updateSavedView({
      prisma: prisma as never,
      savedViewId: view.id,
      body: { isDefault: true },
      context: { actorUserId: userId },
      configuration,
    })));
    expect(defaults.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(await prisma.savedView.count({ where: { userId, isDefault: true } })).toBe(1);
  });

  it('persists explicit sort null as SQL NULL while omitted sort preserves the value', async () => {
    const view = await prisma.savedView.findFirstOrThrow({ where: { userId } });
    await updateSavedView({
      prisma: prisma as never,
      savedViewId: view.id,
      body: { sort: { field: 'updatedAt', direction: 'desc' } },
      context: { actorUserId: userId },
      configuration,
    });
    await updateSavedView({
      prisma: prisma as never,
      savedViewId: view.id,
      body: { name: 'Preserved sort' },
      context: { actorUserId: userId },
      configuration,
    });
    expect((await prisma.savedView.findUniqueOrThrow({ where: { id: view.id } })).sort).toEqual({ field: 'updatedAt', direction: 'desc' });
    const cleared = await updateSavedView({
      prisma: prisma as never,
      savedViewId: view.id,
      body: { sort: null },
      context: { actorUserId: userId },
      configuration,
    });
    expect(cleared.sort).toBeNull();
    expect((await prisma.savedView.findUniqueOrThrow({ where: { id: view.id } })).sort).toBeNull();
  });
});
