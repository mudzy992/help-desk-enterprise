import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInMemoryServiceCatalogPrisma } from './create-in-memory-service-catalog-prisma';
import { defaultServiceLifecycleConfiguration } from './service-catalog.constants';
import { ServiceCatalogService } from './service-catalog.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('service catalog provider independence', () => {
  it('stores the same catalog identity for local and entra actors', async () => {
    const memory = createInMemoryServiceCatalogPrisma();
    const catalog = new ServiceCatalogService(memory.prisma as never, {
      load: async () => defaultServiceLifecycleConfiguration,
    } as never);
    const category = await catalog.createCategory(
      { name: 'IT', slug: 'it' },
      { actorUserId: 'local-admin' },
    );
    const created = await catalog.create(
      { name: 'Access', slug: 'access', categoryId: category.id },
      { actorUserId: 'entra-admin' },
    );
    expect(created.slug).toBe('access');
    expect(created).not.toHaveProperty('provider');
    expect(JSON.stringify(created)).not.toContain('entra');
    expect(memory.changeLogs.map((item) => item.actorUserId)).toEqual([
      'local-admin',
      'entra-admin',
    ]);
  });

  it('does not import authentication providers or directory clients in domain files', () => {
    const directory = join(__dirname);
    const sources = readdirSync(directory).filter(
      (fileName) =>
        fileName.endsWith('.ts') &&
        !fileName.endsWith('.spec.ts') &&
        !fileName.endsWith('.controller.ts') &&
        !fileName.endsWith('.module.ts') &&
        fileName !== 'read-catalog-mutation-context.ts',
    );
    for (const fileName of sources) {
      const source = readFileSync(join(directory, fileName), 'utf8');
      expect(source).not.toContain('msal');
      expect(source).not.toContain('graph.microsoft');
      expect(source).not.toContain('AuthenticationMode');
      expect(source).not.toContain('entraObjectId');
    }
  });
});
