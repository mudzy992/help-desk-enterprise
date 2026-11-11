import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { createInMemoryServiceCatalogPrisma } from './create-in-memory-service-catalog-prisma';
import { defaultServiceLifecycleConfiguration } from './service-catalog.constants';
import { ServiceAvailabilityService } from './service-availability.service';
import { ServiceCatalogService } from './service-catalog.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const now = new Date('2026-09-10T10:00:00.000Z');

describe('service catalog availability and downtime', () => {
  const createHarness = () => {
    const memory = createInMemoryServiceCatalogPrisma();
    const catalog = new ServiceCatalogService(memory.prisma as never, {
      load: async () => defaultServiceLifecycleConfiguration,
    } as never);
    const availability = new ServiceAvailabilityService(
      memory.prisma as never,
      catalog,
    );
    return { memory, catalog, availability };
  };

  const createDraftService = async (catalog: ServiceCatalogService) => {
    const category = await catalog.createCategory({ name: 'IT', slug: 'it' });
    return catalog.create({
      name: 'VPN access',
      slug: 'vpn-access',
      categoryId: category.id,
    });
  };

  it('keeps lifecycle independent from stored availability', async () => {
    const { catalog, availability } = createHarness();
    const created = await createDraftService(catalog);
    const updated = await availability.updateAvailability(
      created.id,
      { availability: 'DOWN', reason: 'Core outage' },
      { actorUserId: 'admin-1' },
      now,
    );
    expect(updated.lifecycle).toBe('DRAFT');
    expect(updated.availability).toBe('DOWN');
    expect(updated.runtimeAvailability.state).toBe('CURRENTLY_UNAVAILABLE');
    expect(updated.runtimeAvailability.ticketCreationAllowed).toBe(true);
    expect(created.offeredToRequesters).toBe(false);
  });

  it('does not block ticket creation for available, unavailable, or downtime states', async () => {
    const { catalog, availability } = createHarness();
    const created = await createDraftService(catalog);
    const available = await availability.evaluateTicketCreationEligibility(
      created.id,
      now,
    );
    expect(available.allowed).toBe(true);
    expect(available.blockedByAvailability).toBe(false);
    await availability.updateAvailability(
      created.id,
      { availability: 'DOWN', reason: 'Outage' },
      { actorUserId: 'admin-1' },
      now,
    );
    const unavailable = await availability.evaluateTicketCreationEligibility(
      created.id,
      now,
    );
    expect(unavailable.allowed).toBe(true);
    expect(unavailable.runtimeAvailability.state).toBe('CURRENTLY_UNAVAILABLE');
    await availability.updateAvailability(
      created.id,
      { availability: 'OPERATIONAL', reason: 'Restored' },
      { actorUserId: 'admin-1' },
      now,
    );
    await availability.createDowntimeWindow(
      created.id,
      {
        startsAt: '2026-09-10T09:00:00.000Z',
        endsAt: '2026-09-10T11:00:00.000Z',
        message: 'Maintenance window',
        reason: 'Switch upgrade',
      },
      { actorUserId: 'admin-1' },
      now,
    );
    const duringDowntime = await availability.evaluateTicketCreationEligibility(
      created.id,
      now,
    );
    expect(duringDowntime.allowed).toBe(true);
    expect(duringDowntime.runtimeAvailability.state).toBe('SCHEDULED_DOWNTIME');
    const future = await availability.evaluateTicketCreationEligibility(
      created.id,
      new Date('2026-09-10T08:00:00.000Z'),
    );
    expect(future.allowed).toBe(true);
    expect(future.runtimeAvailability.state).toBe('CURRENTLY_AVAILABLE');
    const expired = await availability.evaluateTicketCreationEligibility(
      created.id,
      new Date('2026-09-10T11:00:00.000Z'),
    );
    expect(expired.allowed).toBe(true);
    expect(expired.runtimeAvailability.state).toBe('CURRENTLY_AVAILABLE');
  });

  it('rejects invalid and overlapping downtime ranges', async () => {
    const { catalog, availability } = createHarness();
    const created = await createDraftService(catalog);
    await expect(
      availability.createDowntimeWindow(
        created.id,
        {
          startsAt: '2026-09-10T11:00:00.000Z',
          endsAt: '2026-09-10T10:00:00.000Z',
          message: 'Bad range',
          reason: 'Test',
        },
        { actorUserId: 'admin-1' },
        now,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await availability.createDowntimeWindow(
      created.id,
      {
        startsAt: '2026-09-10T10:00:00.000Z',
        endsAt: '2026-09-10T12:00:00.000Z',
        message: 'First window',
        reason: 'Test',
      },
      { actorUserId: 'admin-1' },
      now,
    );
    await expect(
      availability.createDowntimeWindow(
        created.id,
        {
          startsAt: '2026-09-10T11:00:00.000Z',
          endsAt: '2026-09-10T13:00:00.000Z',
          message: 'Overlap',
          reason: 'Test',
        },
        { actorUserId: 'admin-1' },
        now,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires a reason when changing availability', async () => {
    const { catalog, availability } = createHarness();
    const created = await createDraftService(catalog);
    await expect(
      availability.updateAvailability(
        created.id,
        { availability: 'DEGRADED' },
        { actorUserId: 'admin-1' },
        now,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
