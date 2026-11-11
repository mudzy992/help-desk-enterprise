import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { defaultServiceLifecycleConfiguration } from '../service-catalog/service-catalog.constants';
import { createConfigSnapshotFixture } from './create-config-snapshot-fixture';
import type { ConfigSnapshot } from './config-versioning.types';
import { applyCatalogSnapshot } from './apply-catalog-snapshot';
import { computeCatalogStateHash } from './catalog-state-hash';
import { configVersioningErrorCodes } from './config-versioning.constants';
import {
  toFormVersionSnapshot,
  toServiceSnapshot,
} from './serialize-config-snapshot';

const databaseUrl = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = databaseUrl ? describe : describe.skip;
const stamp = `${Date.now()}-${process.pid}`;
const originalSchema = {
  schemaVersion: 1,
  fields: [
    {
      id: 'summary',
      label: 'Summary',
      type: 'text',
      required: true,
      order: 0,
    },
  ],
};
const changedSchema = {
  schemaVersion: 1,
  fields: [
    ...originalSchema.fields,
    {
      id: 'asset_tag',
      label: 'Asset tag',
      type: 'text',
      required: false,
      order: 1,
    },
  ],
};

type Fixture = {
  readonly serviceId: string;
  readonly formId: string;
};

describeIfDatabase('config catalog snapshot domain policy (PostgreSQL)', () => {
  jest.setTimeout(120_000);

  let prisma: PrismaClient | undefined;
  const categoryIds: string[] = [];
  const serviceIds: string[] = [];

  const db = (): PrismaClient => {
    if (prisma === undefined)
      throw new Error('PostgreSQL client not initialized');
    return prisma;
  };

  const createFixture = async (label: string): Promise<Fixture> => {
    const suffix = `${stamp}-${label}`;
    const category = await db().serviceCategory.create({
      data: {
        name: `BA-02 category ${suffix}`,
        slug: `ba02-category-${suffix}`,
      },
      select: { id: true },
    });
    categoryIds.push(category.id);
    const service = await db().service.create({
      data: {
        name: `BA-02 service ${suffix}`,
        slug: `ba02-service-${suffix}`,
        categoryId: category.id,
        lifecycle: 'ACTIVE',
      },
      select: { id: true },
    });
    serviceIds.push(service.id);
    const form = await db().formVersion.create({
      data: {
        serviceId: service.id,
        version: 1,
        schema: originalSchema,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    return { serviceId: service.id, formId: form.id };
  };

  beforeAll(() => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl! }),
    });
  });

  afterAll(async () => {
    const client = prisma;
    if (client === undefined) return;
    try {
      await client.formVersion.deleteMany({
        where: { serviceId: { in: serviceIds } },
      });
      await client.service.deleteMany({ where: { id: { in: serviceIds } } });
      await client.serviceCategory.deleteMany({
        where: { id: { in: categoryIds } },
      });
    } finally {
      await client.$disconnect();
    }
  });

  it('locks the live catalog and creates a new version for an ACTIVE historical schema', async () => {
    const fixture = await createFixture('immutable');
    const service = await db().service.findUniqueOrThrow({
      where: { id: fixture.serviceId },
    });
    const form = await db().formVersion.findUniqueOrThrow({
      where: { id: fixture.formId },
    });
    const snapshot = candidateSnapshot(service, form, changedSchema);

    const applied = await db().$transaction((transaction) =>
      applyCatalogSnapshot(
        transaction,
        snapshot,
        defaultServiceLifecycleConfiguration,
      ),
    );

    const versions = await db().formVersion.findMany({
      where: { serviceId: fixture.serviceId },
      orderBy: { version: 'asc' },
    });
    expect(versions).toHaveLength(2);
    expect(versions[0]).toMatchObject({
      id: fixture.formId,
      version: 1,
      status: 'RETIRED',
      schema: originalSchema,
    });
    expect(versions[1]).toMatchObject({
      version: 2,
      status: 'ACTIVE',
      schema: changedSchema,
    });
    expect(
      versions.filter((version) => version.status === 'ACTIVE'),
    ).toHaveLength(1);
    expect(applied.forms.versions.map((version) => version.id)).toEqual(
      versions.map((version) => version.id),
    );
    const servicesAfter = await db().service.findMany({
      where: { id: fixture.serviceId },
    });
    expect(applied.catalogStateHash).toBe(
      computeCatalogStateHash(servicesAfter, versions),
    );
  });

  it('rejects a stale catalog hash without overwriting the intervening service update', async () => {
    const fixture = await createFixture('stale');
    const service = await db().service.findUniqueOrThrow({
      where: { id: fixture.serviceId },
    });
    const form = await db().formVersion.findUniqueOrThrow({
      where: { id: fixture.formId },
    });
    const snapshot = candidateSnapshot(service, form, changedSchema);
    await db().service.update({
      where: { id: fixture.serviceId },
      data: { name: `Concurrent update ${stamp}` },
    });

    await expect(
      db().$transaction((transaction) =>
        applyCatalogSnapshot(
          transaction,
          snapshot,
          defaultServiceLifecycleConfiguration,
        ),
      ),
    ).rejects.toMatchObject({
      code: configVersioningErrorCodes.catalogStateConflict,
    });
    const [updatedService, unchangedForm] = await Promise.all([
      db().service.findUniqueOrThrow({ where: { id: fixture.serviceId } }),
      db().formVersion.findUniqueOrThrow({ where: { id: fixture.formId } }),
    ]);
    expect(updatedService.name).toBe(`Concurrent update ${stamp}`);
    expect(unchangedForm.schema).toEqual(originalSchema);
  });
});

function candidateSnapshot(
  service: Parameters<typeof toServiceSnapshot>[0],
  form: Parameters<typeof toFormVersionSnapshot>[0],
  schema: unknown,
): ConfigSnapshot {
  const base = createConfigSnapshotFixture();
  return {
    ...base,
    catalogStateHash: computeCatalogStateHash([service], [form]),
    catalog: { services: [toServiceSnapshot(service)] },
    forms: {
      versions: [
        {
          ...toFormVersionSnapshot(form),
          schema: JSON.parse(
            JSON.stringify(schema),
          ) as ConfigSnapshot['forms']['versions'][number]['schema'],
        },
      ],
    },
  };
}
