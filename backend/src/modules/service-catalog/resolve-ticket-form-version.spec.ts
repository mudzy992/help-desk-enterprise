import { createInMemoryServiceCatalogPrisma } from './create-in-memory-service-catalog-prisma';
import { defaultServiceLifecycleConfiguration } from './service-catalog.constants';
import { ServiceCatalogService } from './service-catalog.service';
import { resolveTicketFormVersion } from './resolve-ticket-form-version';
import { defaultServiceFormsConfiguration } from './service-forms.constants';
import { ServiceFormsService } from './service-forms.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const schema = {
  schemaVersion: 1,
  fields: [
    {
      id: 'asset_tag',
      label: 'Asset tag',
      type: 'text',
      required: true,
      order: 0,
    },
  ],
};

describe('resolveTicketFormVersion', () => {
  const createHarness = () => {
    const memory = createInMemoryServiceCatalogPrisma();
    const catalog = new ServiceCatalogService(memory.prisma as never, {
      load: async () => defaultServiceLifecycleConfiguration,
    } as never);
    const forms = new ServiceFormsService(memory.prisma as never, {
      load: async () => defaultServiceFormsConfiguration,
    } as never);
    return { memory, catalog, forms };
  };

  it('returns the exact bound schema and form data without writing', async () => {
    const { memory, catalog, forms } = createHarness();
    const category = await catalog.createCategory({ name: 'IT', slug: 'it' });
    const service = await catalog.create({
      name: 'VPN access',
      slug: 'vpn-access',
      categoryId: category.id,
    });
    const version = await forms.createForm(service.id, { schema });
    await forms.activateFormVersion(service.id, version.formVersionRef);
    memory.seedTicket({
      id: 'ticket-1',
      ticketNumber: 'T-1',
      serviceId: service.id,
      formVersionId: version.formVersionRef,
      status: 'PENDING',
      formData: { asset_tag: 'LPT-1' },
    });
    const logCountBeforeRead = memory.changeLogs.length;

    await expect(resolveTicketFormVersion(memory.prisma as never, 'ticket-1')).resolves.toEqual({
      ticketId: 'ticket-1',
      serviceId: service.id,
      formVersionRef: version.formVersionRef,
      schema,
      formData: { asset_tag: 'LPT-1' },
    });
    expect(memory.changeLogs).toHaveLength(logCountBeforeRead);
  });

  it('returns null schema for a ticket created without a form', async () => {
    const { memory, catalog } = createHarness();
    const category = await catalog.createCategory({ name: 'HR', slug: 'hr' });
    const service = await catalog.create({
      name: 'Leave request',
      slug: 'leave-request',
      categoryId: category.id,
    });
    memory.seedTicket({
      id: 'ticket-no-form',
      ticketNumber: 'T-2',
      serviceId: service.id,
      formVersionId: null,
      status: 'PENDING',
      formData: null,
    });

    await expect(
      resolveTicketFormVersion(memory.prisma as never, 'ticket-no-form'),
    ).resolves.toEqual({
      ticketId: 'ticket-no-form',
      serviceId: service.id,
      formVersionRef: null,
      schema: null,
      formData: null,
    });
  });

  it('returns not found for a missing ticket', async () => {
    const { memory } = createHarness();
    await expect(
      resolveTicketFormVersion(memory.prisma as never, 'missing'),
    ).rejects.toMatchObject({ code: 'TICKET_NOT_FOUND' });
  });
});
