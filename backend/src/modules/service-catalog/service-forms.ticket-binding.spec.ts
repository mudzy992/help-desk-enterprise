import { createInMemoryServiceCatalogPrisma } from './create-in-memory-service-catalog-prisma';
import { defaultServiceLifecycleConfiguration } from './service-catalog.constants';
import { ServiceCatalogService } from './service-catalog.service';
import { defaultServiceFormsConfiguration } from './service-forms.constants';
import { ServiceFormsService } from './service-forms.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const versionOneSchema = {
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

const versionTwoSchema = {
  schemaVersion: 1,
  fields: [
    {
      id: 'serial_number',
      label: 'Serial number',
      type: 'text',
      required: true,
      order: 0,
    },
  ],
};

describe('ticket formVersionRef binding', () => {
  const createHarness = () => {
    const memory = createInMemoryServiceCatalogPrisma();
    const catalog = new ServiceCatalogService(memory.prisma as never, {
      load: async () => defaultServiceLifecycleConfiguration,
    } as never);
    const forms = new ServiceFormsService(memory.prisma as never, {
      load: async () => defaultServiceFormsConfiguration,
    } as never);
    return { catalog, forms };
  };

  it('stores and resolves the exact form version on a ticket', async () => {
    const { catalog, forms } = createHarness();
    const category = await catalog.createCategory({ name: 'IT', slug: 'it' });
    const service = await catalog.create({
      name: 'VPN access',
      slug: 'vpn-access',
      categoryId: category.id,
    });
    const first = await forms.createForm(service.id, { schema: versionOneSchema });
    await forms.activateFormVersion(service.id, first.formVersionRef);
    const binding = await forms.bindTicketFormVersionRef(
      service.id,
      first.formVersionRef,
    );
    expect(binding.formVersionRef).toBe(first.formVersionRef);
    expect(binding.schema).toEqual(versionOneSchema);
    const resolved = await forms.resolveTicketFormVersion(binding.ticketId);
    expect(resolved.formVersionRef).toBe(first.formVersionRef);
    expect(resolved.schema).toEqual(versionOneSchema);
  });

  it('keeps an older ticket bound after a newer version exists', async () => {
    const { catalog, forms } = createHarness();
    const category = await catalog.createCategory({ name: 'HR', slug: 'hr' });
    const service = await catalog.create({
      name: 'Leave request',
      slug: 'leave-request',
      categoryId: category.id,
    });
    const first = await forms.createForm(service.id, { schema: versionOneSchema });
    await forms.activateFormVersion(service.id, first.formVersionRef);
    const olderTicket = await forms.bindTicketFormVersionRef(
      service.id,
      first.formVersionRef,
    );
    const second = await forms.createFormVersion(service.id, {
      schema: versionTwoSchema,
    });
    await forms.activateFormVersion(service.id, second.formVersionRef);
    const newerTicket = await forms.bindTicketFormVersionRef(
      service.id,
      second.formVersionRef,
    );
    const form = await forms.getForm(service.id);
    expect(form.activeFormVersionRef).toBe(second.formVersionRef);
    await expect(forms.selectActiveFormVersionRef(service.id)).resolves.toBe(
      second.formVersionRef,
    );
    const older = await forms.resolveTicketFormVersion(olderTicket.ticketId);
    expect(older.formVersionRef).toBe(first.formVersionRef);
    expect(older.schema).toEqual(versionOneSchema);
    const newer = await forms.resolveTicketFormVersion(newerTicket.ticketId);
    expect(newer.formVersionRef).toBe(second.formVersionRef);
    expect(newer.schema).toEqual(versionTwoSchema);
  });
});
