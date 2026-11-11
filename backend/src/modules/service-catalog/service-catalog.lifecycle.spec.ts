import { BadRequestException, ConflictException } from '@nestjs/common';
import { createInMemoryServiceCatalogPrisma } from './create-in-memory-service-catalog-prisma';
import { getServiceForm } from './get-service-form';
import { defaultServiceLifecycleConfiguration } from './service-catalog.constants';
import { ServiceCatalogService } from './service-catalog.service';
import type { ServiceLifecycleConfiguration } from './service-catalog.types';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('ServiceCatalogService lifecycle', () => {
  const createHarness = (
    configuration: ServiceLifecycleConfiguration = defaultServiceLifecycleConfiguration,
  ) => {
    const memory = createInMemoryServiceCatalogPrisma();
    const catalog = new ServiceCatalogService(memory.prisma as never, {
      load: async () => configuration,
    } as never);
    return { memory, catalog };
  };

  const seedActiveForm = (
    memory: ReturnType<typeof createInMemoryServiceCatalogPrisma>,
    serviceId: string,
    status: 'ACTIVE' | 'RETIRED' = 'ACTIVE',
  ) => {
    const now = new Date('2026-09-10T10:00:00.000Z');
    memory.seedFormVersion({
      id: `form-${serviceId}`,
      serviceId,
      version: 1,
      schema: { schemaVersion: 1, fields: [] },
      status,
      createdAt: now,
      updatedAt: now,
    });
  };

  const createDraft = async (
    catalog: ServiceCatalogService,
    memory: ReturnType<typeof createInMemoryServiceCatalogPrisma>,
    options: {
      readonly withActiveForm?: boolean;
      readonly slug?: string;
    } = {},
  ) => {
    const slug = options.slug ?? 'vpn-access';
    const category = await catalog.createCategory({
      name: 'IT',
      slug: `it-${slug}`,
    });
    const created = await catalog.create({
      name: 'VPN access',
      slug,
      categoryId: category.id,
    });
    if (options.withActiveForm !== false) {
      seedActiveForm(memory, created.id);
    }
    return created;
  };

  it('publishes, retires, and reactivates without changing id or slug', async () => {
    const { catalog, memory } = createHarness();
    const created = await createDraft(catalog, memory);
    const published = await catalog.transitionLifecycle(created.id, {
      lifecycle: 'ACTIVE',
    });
    expect(published.lifecycle).toBe('ACTIVE');
    expect(published.offeredToRequesters).toBe(true);
    expect(published.id).toBe(created.id);
    expect(published.slug).toBe('vpn-access');
    const retired = await catalog.transitionLifecycle(created.id, {
      lifecycle: 'DEPRECATED',
    });
    expect(retired.lifecycle).toBe('DEPRECATED');
    expect(retired.offeredToRequesters).toBe(false);
    expect(retired.id).toBe(created.id);
    expect(retired.slug).toBe(created.slug);
    const reactivated = await catalog.transitionLifecycle(created.id, {
      lifecycle: 'ACTIVE',
    });
    expect(reactivated.lifecycle).toBe('ACTIVE');
    expect(reactivated.id).toBe(created.id);
    expect(
      memory.changeLogs.filter((item) => item.reason === 'lifecycle_transition'),
    ).toHaveLength(3);
  });

  it('hides draft and deprecated services from requester listing', async () => {
    const { catalog, memory } = createHarness();
    const created = await createDraft(catalog, memory);
    await catalog.transitionLifecycle(created.id, { lifecycle: 'ACTIVE' });
    const second = await catalog.create({
      name: 'Draft only',
      slug: 'draft-only',
      categoryId: created.categoryId,
    });
    await catalog.transitionLifecycle(created.id, { lifecycle: 'DEPRECATED' });
    const offered = await catalog.list({ offeredOnly: true });
    expect(offered.map((item) => item.id)).toEqual([]);
    await catalog.transitionLifecycle(created.id, { lifecycle: 'ACTIVE' });
    const offeredAfter = await catalog.list({ offeredOnly: true });
    expect(offeredAfter.map((item) => item.slug)).toEqual(['vpn-access']);
    expect(offeredAfter.map((item) => item.slug)).not.toContain(second.slug);
  });

  it('val 2 (M6/B2): vidljivost po roli — nacrt nikad ne prolazi do korisnika', async () => {
    const { catalog, memory } = createHarness();
    const active = await createDraft(catalog, memory);
    await catalog.transitionLifecycle(active.id, { lifecycle: 'ACTIVE' });
    const deprecated = await catalog.create({
      name: 'Legacy mail',
      slug: 'legacy-mail',
      categoryId: active.categoryId,
    });
    seedActiveForm(memory, deprecated.id);
    await catalog.transitionLifecycle(deprecated.id, { lifecycle: 'ACTIVE' });
    await catalog.transitionLifecycle(deprecated.id, { lifecycle: 'DEPRECATED' });
    const draft = await catalog.create({
      name: 'Not yet published',
      slug: 'not-yet-published',
      categoryId: active.categoryId,
    });

    const requester = ['USER'];
    const agent = ['AGENT'];
    const admin = ['ADMIN'];

    // Korisnik vidi samo objavljeno.
    expect(
      (await catalog.list({ visibleLifecycles: ['ACTIVE'] })).map((item) => item.slug),
    ).toEqual(['vpn-access']);
    // Agent vidi i zastarjelo (tiketi na tim servisima još postoje), ali ne nacrt.
    expect(
      (await catalog.list({ visibleLifecycles: ['ACTIVE', 'DEPRECATED'] })).map(
        (item) => item.slug,
      ),
    ).toEqual(['legacy-mail', 'vpn-access']);
    // Administrator vidi sve.
    expect(
      (await catalog.list({ visibleLifecycles: ['DRAFT', 'ACTIVE', 'DEPRECATED'] })).map(
        (item) => item.slug,
      ),
    ).toContain(draft.slug);
    // Interni poziv (bez role) ostaje bez filtera — isto kao prije popravke.
    expect((await catalog.list({})).map((item) => item.slug)).toContain(draft.slug);

    // Eksplicitni zahtjev za skriveno stanje ne otkriva redove.
    expect(await catalog.list({ lifecycle: 'DRAFT', visibleLifecycles: ['ACTIVE'] })).toEqual(
      [],
    );

    // Direktan pogled na nacrt: za korisnika i agenta „ne postoji“.
    await expect(
      catalog.getById(draft.id, new Date(), requester),
    ).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    await expect(
      catalog.getById(draft.id, new Date(), agent),
    ).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    await expect(catalog.getById(draft.id, new Date(), admin)).resolves.toMatchObject({
      slug: draft.slug,
    });
    // Isto za šemu forme nacrta (RAW `:304`).
    // Funkcija je bez `execute` omotača, pa greška dolazi u svom obliku.
    await expect(
      getServiceForm(memory.prisma as never, draft.id, requester),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      getServiceForm(memory.prisma as never, active.id, requester),
    ).resolves.toBeDefined();
  });

  it('blocks activation without an active form, but allows deprecation after a form retires', async () => {
    const { catalog, memory } = createHarness();
    const withoutForm = await createDraft(catalog, memory, { withActiveForm: false });
    await expect(
      catalog.transitionLifecycle(withoutForm.id, { lifecycle: 'ACTIVE' }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'NO_ACTIVE_FORM_VERSION' },
    });

    const withForm = await createDraft(catalog, memory, { slug: 'vpn-with-form' });
    await expect(
      catalog.transitionLifecycle(withForm.id, { lifecycle: 'ACTIVE' }),
    ).resolves.toMatchObject({ lifecycle: 'ACTIVE' });
    seedActiveForm(memory, withForm.id, 'RETIRED');
    await expect(
      catalog.transitionLifecycle(withForm.id, { lifecycle: 'DEPRECATED' }),
    ).resolves.toMatchObject({ lifecycle: 'DEPRECATED' });
  });

  it('rejects invalid transitions including draft to deprecated', async () => {
    const { catalog, memory } = createHarness();
    const created = await createDraft(catalog, memory);
    await expect(
      catalog.transitionLifecycle(created.id, { lifecycle: 'DEPRECATED' }),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_LIFECYCLE_TRANSITION' },
    });
    await expect(
      catalog.transitionLifecycle(created.id, { lifecycle: 'DEPRECATED' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await catalog.transitionLifecycle(created.id, { lifecycle: 'ACTIVE' });
    await expect(
      catalog.transitionLifecycle(created.id, { lifecycle: 'DRAFT' }),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_LIFECYCLE_TRANSITION' },
    });
  });

  it('creates using the configured default state and blocks transitions when disabled', async () => {
    const { catalog, memory } = createHarness({
      enabled: false,
      allowedStates: ['DRAFT', 'ACTIVE', 'DEPRECATED'],
      defaultStateOnCreate: 'DRAFT',
    });
    const created = await createDraft(catalog, memory);
    expect(created.lifecycle).toBe('DRAFT');
    await expect(
      catalog.transitionLifecycle(created.id, { lifecycle: 'ACTIVE' }),
    ).rejects.toMatchObject({
      response: { code: 'LIFECYCLE_DISABLED' },
    });
  });

  it('refuses to delete active or deprecated services', async () => {
    const { catalog, memory } = createHarness();
    const created = await createDraft(catalog, memory);
    await catalog.transitionLifecycle(created.id, { lifecycle: 'ACTIVE' });
    await expect(catalog.delete(created.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    memory.seedServiceDependents(created.id, { tickets: 1 });
    await catalog.transitionLifecycle(created.id, { lifecycle: 'DEPRECATED' });
    await expect(catalog.delete(created.id)).rejects.toMatchObject({
      response: { code: 'NOT_DELETABLE' },
    });
  });

  it('refuses to delete a draft that still has dependents', async () => {
    const { catalog, memory } = createHarness();
    const created = await createDraft(catalog, memory);
    memory.seedServiceDependents(created.id, { formVersions: 1 });
    await expect(catalog.delete(created.id)).rejects.toMatchObject({
      response: { code: 'HAS_DEPENDENCIES' },
    });
  });
});
