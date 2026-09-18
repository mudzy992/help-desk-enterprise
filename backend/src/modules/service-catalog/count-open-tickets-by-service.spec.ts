import { countOpenTicketsByService } from './count-open-tickets-by-service';
import { createInMemoryServiceCatalogPrisma } from './create-in-memory-service-catalog-prisma';
import { ServiceCatalogService } from './service-catalog.service';
import { defaultServiceLifecycleConfiguration } from './service-catalog.constants';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

type TicketCreate = {
  create: (input: {
    data: {
      ticketNumber: string;
      serviceId: string;
      formVersionId: string;
      status?: string;
    };
  }) => Promise<unknown>;
};

describe('countOpenTicketsByService', () => {
  it('counts only non-terminal tickets per service in one batch', async () => {
    const memory = createInMemoryServiceCatalogPrisma();
    const ticket = memory.prisma.ticket as TicketCreate;
    await ticket.create({
      data: {
        ticketNumber: 'T-1',
        serviceId: 'svc-a',
        formVersionId: 'fv-1',
        status: 'IN_PROGRESS',
      },
    });
    await ticket.create({
      data: {
        ticketNumber: 'T-2',
        serviceId: 'svc-a',
        formVersionId: 'fv-1',
        status: 'PENDING',
      },
    });
    await ticket.create({
      data: {
        ticketNumber: 'T-3',
        serviceId: 'svc-a',
        formVersionId: 'fv-1',
        status: 'RESOLVED',
      },
    });
    await ticket.create({
      data: {
        ticketNumber: 'T-4',
        serviceId: 'svc-a',
        formVersionId: 'fv-1',
        status: 'CLOSED',
      },
    });
    await ticket.create({
      data: {
        ticketNumber: 'T-5',
        serviceId: 'svc-a',
        formVersionId: 'fv-1',
        status: 'ARCHIVED',
      },
    });
    await ticket.create({
      data: {
        ticketNumber: 'T-6',
        serviceId: 'svc-b',
        formVersionId: 'fv-1',
        status: 'ASSIGNED',
      },
    });
    const counts = await countOpenTicketsByService(memory.prisma as never, [
      'svc-a',
      'svc-b',
      'svc-empty',
    ]);
    expect(counts.get('svc-a')).toBe(2);
    expect(counts.get('svc-b')).toBe(1);
    expect(counts.get('svc-empty')).toBe(0);
  });

  it('exposes openTicketCount on list and getById responses', async () => {
    const memory = createInMemoryServiceCatalogPrisma();
    const service = new ServiceCatalogService(memory.prisma as never, {
      load: async () => defaultServiceLifecycleConfiguration,
    } as never);
    const category = await service.createCategory({ name: 'IT', slug: 'it' });
    const created = await service.create({
      name: 'VPN',
      slug: 'vpn',
      categoryId: category.id,
    });
    const ticket = memory.prisma.ticket as TicketCreate;
    await ticket.create({
      data: {
        ticketNumber: 'T-1',
        serviceId: created.id,
        formVersionId: 'fv-1',
        status: 'IN_PROGRESS',
      },
    });
    await ticket.create({
      data: {
        ticketNumber: 'T-2',
        serviceId: created.id,
        formVersionId: 'fv-1',
        status: 'CLOSED',
      },
    });
    const listed = await service.list({});
    expect(listed[0]?.openTicketCount).toBe(1);
    const retrieved = await service.getById(created.id);
    expect(retrieved.openTicketCount).toBe(1);
  });
});
