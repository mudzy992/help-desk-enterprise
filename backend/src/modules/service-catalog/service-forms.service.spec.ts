import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { createInMemoryServiceCatalogPrisma } from './create-in-memory-service-catalog-prisma';
import { defaultServiceLifecycleConfiguration } from './service-catalog.constants';
import { ServiceCatalogService } from './service-catalog.service';
import { defaultServiceFormsConfiguration } from './service-forms.constants';
import { ServiceFormsService } from './service-forms.service';
import type { ServiceFormsConfiguration } from './service-forms.types';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const validSchema = {
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

const nextSchema = {
  schemaVersion: 1,
  fields: [
    {
      id: 'asset_tag',
      label: 'Asset tag',
      type: 'text',
      required: true,
      order: 0,
    },
    {
      id: 'serial_number',
      label: 'Serial number',
      type: 'text',
      required: true,
      order: 1,
    },
  ],
};

describe('ServiceFormsService', () => {
  const createHarness = (
    configuration: ServiceFormsConfiguration = defaultServiceFormsConfiguration,
  ) => {
    const memory = createInMemoryServiceCatalogPrisma();
    const catalog = new ServiceCatalogService(memory.prisma as never, {
      load: async () => defaultServiceLifecycleConfiguration,
    } as never);
    const forms = new ServiceFormsService(memory.prisma as never, {
      load: async () => configuration,
    });
    return { catalog, forms };
  };

  const createDraftService = async (catalog: ServiceCatalogService) => {
    const category = await catalog.createCategory({ name: 'IT', slug: 'it' });
    return catalog.create({
      name: 'VPN access',
      slug: 'vpn-access',
      categoryId: category.id,
    });
  };

  it('creates a form as version 1 without hardcoded service fields', async () => {
    const { catalog, forms } = createHarness();
    const service = await createDraftService(catalog);
    const created = await forms.createForm(service.id, { schema: validSchema });
    expect(created.version).toBe(1);
    expect(created.status).toBe('DRAFT');
    expect(created.isImmutable).toBe(false);
    expect(created.schema).toEqual(validSchema);
    expect(created.formVersionRef).toBe(created.formVersionRef);
    await expect(
      forms.createForm(service.id, { schema: validSchema }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a new form version without mutating the previous one', async () => {
    const { catalog, forms } = createHarness();
    const service = await createDraftService(catalog);
    const first = await forms.createForm(service.id, { schema: validSchema });
    const second = await forms.createFormVersion(service.id, {
      schema: nextSchema,
    });
    expect(second.version).toBe(2);
    expect(second.formVersionRef).not.toBe(first.formVersionRef);
    const original = await forms.getFormVersion(service.id, first.formVersionRef);
    expect(original.schema).toEqual(validSchema);
    expect(original.version).toBe(1);
  });

  it('makes a version immutable after tickets reference it', async () => {
    const { catalog, forms } = createHarness();
    const service = await createDraftService(catalog);
    const first = await forms.createForm(service.id, { schema: validSchema });
    await forms.bindTicketFormVersionRef(service.id, first.formVersionRef);
    await expect(
      forms.updateFormVersion(service.id, first.formVersionRef, {
        schema: nextSchema,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    const locked = await forms.getFormVersion(service.id, first.formVersionRef);
    expect(locked.isImmutable).toBe(true);
    expect(locked.schema).toEqual(validSchema);
  });

  it('rejects invalid schemas through create', async () => {
    const { catalog, forms } = createHarness();
    const service = await createDraftService(catalog);
    await expect(
      forms.createForm(service.id, { schema: { schemaVersion: 1 } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
