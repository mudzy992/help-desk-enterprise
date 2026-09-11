import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { createInMemoryServiceCatalogPrisma } from './create-in-memory-service-catalog-prisma';
import { ServiceAvailabilityConfigurationLoader } from './service-availability-configuration.loader';
import { defaultServiceLifecycleConfiguration } from './service-catalog.constants';
import { ServiceCatalogService } from './service-catalog.service';
import type { ServiceLifecycleConfiguration } from './service-catalog.types';
import { ServiceLifecycleConfigurationLoader } from './service-lifecycle-configuration.loader';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('ServiceCatalogService CRUD', () => {
  it('resolves the availability configuration loader through Nest DI', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ServiceCatalogService,
        { provide: PrismaService, useValue: {} },
        {
          provide: ServiceLifecycleConfigurationLoader,
          useValue: { load: async () => undefined },
        },
        {
          provide: ServiceAvailabilityConfigurationLoader,
          useValue: { load: async () => undefined },
        },
      ],
    }).compile();
    expect(moduleRef.get(ServiceCatalogService)).toBeInstanceOf(
      ServiceCatalogService,
    );
  });

  const createHarness = (
    configuration: ServiceLifecycleConfiguration = defaultServiceLifecycleConfiguration,
  ) => {
    const memory = createInMemoryServiceCatalogPrisma();
    const service = new ServiceCatalogService(memory.prisma as never, {
      load: async () => configuration,
    } as never);
    return { memory, service };
  };

  it('creates a category and a draft service with stable identity metadata', async () => {
    const { service, memory } = createHarness();
    const category = await service.createCategory({
      name: 'IT',
      slug: 'it',
    });
    const created = await service.create({
      name: 'Password reset',
      slug: 'password-reset',
      categoryId: category.id,
      classification: 'INTERNAL',
    });
    expect(created.lifecycle).toBe('DRAFT');
    expect(created.offeredToRequesters).toBe(false);
    expect(created.slug).toBe('password-reset');
    expect(created.availability).toBe('OPERATIONAL');
    expect(created.id).toMatch(/^record-/);
    expect(memory.changeLogs.map((item) => item.reason)).toEqual([
      'create',
      'create',
    ]);
    const retrieved = await service.getById(created.id);
    expect(retrieved.slug).toBe(created.slug);
  });

  it('lists, updates metadata, and keeps slug stable', async () => {
    const { service } = createHarness();
    const category = await service.createCategory({ name: 'HR', slug: 'hr' });
    const created = await service.create({
      name: 'Leave request',
      slug: 'leave-request',
      categoryId: category.id,
    });
    const updated = await service.update(created.id, {
      name: 'Leave requests',
      requiresApproval: true,
    });
    expect(updated.name).toBe('Leave requests');
    expect(updated.slug).toBe('leave-request');
    expect(updated.id).toBe(created.id);
    expect(updated.lifecycle).toBe('DRAFT');
    const listed = await service.list({ categoryId: category.id });
    expect(listed.map((item) => item.id)).toEqual([created.id]);
  });

  it('rejects duplicate slugs and missing categories', async () => {
    const { service } = createHarness();
    const category = await service.createCategory({ name: 'IT', slug: 'it' });
    await service.create({
      name: 'Access',
      slug: 'access',
      categoryId: category.id,
    });
    await expect(
      service.create({
        name: 'Access two',
        slug: 'access',
        categoryId: category.id,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.create({
        name: 'Missing category',
        slug: 'missing-category',
        categoryId: 'unknown',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes a draft without dependents and refuses a category that still has services', async () => {
    const { service } = createHarness();
    const category = await service.createCategory({ name: 'IT', slug: 'it' });
    const created = await service.create({
      name: 'Access',
      slug: 'access',
      categoryId: category.id,
    });
    await expect(service.deleteCategory(category.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await service.delete(created.id);
    await expect(service.getById(created.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await service.deleteCategory(category.id);
  });

  it('rejects invalid names and slugs', async () => {
    const { service } = createHarness();
    await expect(
      service.createCategory({ name: '  ', slug: 'it' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createCategory({ name: 'IT', slug: 'IT Service' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
