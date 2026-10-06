import { createInMemoryServiceCatalogPrisma } from '../service-catalog/create-in-memory-service-catalog-prisma';
import { defaultServiceFormsConfiguration } from '../service-catalog/service-forms.constants';
import type { ServiceFormsConfiguration } from '../service-catalog/service-forms.types';
import { resolveCreateFormVersionRef } from './resolve-create-form-version-ref';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const forms = (
  overrides: Partial<ServiceFormsConfiguration> = {},
): ServiceFormsConfiguration => ({
  ...defaultServiceFormsConfiguration,
  ...overrides,
});

describe('resolveCreateFormVersionRef', () => {
  const seedActiveVersion = (
    memory: ReturnType<typeof createInMemoryServiceCatalogPrisma>,
    id = 'form-active',
    serviceId = 'service-1',
  ) => {
    const now = new Date('2026-10-06T10:00:00.000Z');
    memory.seedFormVersion({
      id,
      serviceId,
      version: 1,
      schema: { schemaVersion: 1, fields: [] },
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
  };

  it('does not bind a form when forms are disabled, even if an active version exists', async () => {
    const memory = createInMemoryServiceCatalogPrisma();
    seedActiveVersion(memory);

    await expect(
      resolveCreateFormVersionRef(
        memory.prisma as never,
        { serviceId: 'service-1' },
        forms({ enabled: false }),
      ),
    ).resolves.toBeNull();
  });

  it('selects the active version when forms are enabled and a version is available', async () => {
    const memory = createInMemoryServiceCatalogPrisma();
    seedActiveVersion(memory);

    await expect(
      resolveCreateFormVersionRef(
        memory.prisma as never,
        { serviceId: 'service-1' },
        forms({ requireVersionOnTicket: false }),
      ),
    ).resolves.toBe('form-active');
  });

  it('allows a ticket without a form when the version is optional and none is active', async () => {
    const memory = createInMemoryServiceCatalogPrisma();

    await expect(
      resolveCreateFormVersionRef(
        memory.prisma as never,
        { serviceId: 'service-1' },
        forms({ requireVersionOnTicket: false }),
      ),
    ).resolves.toBeNull();
  });

  it('preserves the required-version error when no active version exists', async () => {
    const memory = createInMemoryServiceCatalogPrisma();

    await expect(
      resolveCreateFormVersionRef(
        memory.prisma as never,
        { serviceId: 'service-1' },
        forms({ requireVersionOnTicket: true }),
      ),
    ).rejects.toMatchObject({ code: 'FORM_VERSION_REQUIRED' });
  });
});
