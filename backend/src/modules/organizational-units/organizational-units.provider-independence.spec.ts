import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInMemoryOrganizationalUnitPrisma } from './create-in-memory-organizational-unit-prisma';
import { OrganizationalUnitsService } from './organizational-units.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('organizational unit authentication independence', () => {
  it('maps local and entra-linked users through the same User → OU relation', async () => {
    const memory = createInMemoryOrganizationalUnitPrisma();
    const service = new OrganizationalUnitsService(memory.prisma as never);
    const unit = await service.create({
      name: 'Korisnici',
      type: 'DIRECTORATE',
      distinguishedName: 'OU=Korisnici,DC=epbih,DC=ba',
    });
    memory.seedUser({
      id: 'local-user',
      email: 'admin@example.com',
      displayName: 'Local Admin',
      organizationalUnitId: null,
      isLocalOnly: true,
      entraObjectId: null,
      localPasswordHash: 'hash-must-not-leak',
    });
    memory.seedUser({
      id: 'entra-user',
      email: 'agent@example.com',
      displayName: 'Directory Agent',
      organizationalUnitId: null,
      isLocalOnly: false,
      entraObjectId: 'entra-object-1',
      localPasswordHash: null,
    });
    const localMapping = await service.assignUser({
      userId: 'local-user',
      organizationalUnitId: unit.id,
    });
    const entraMapping = await service.assignUser({
      userId: 'entra-user',
      organizationalUnitId: unit.id,
    });
    expect(localMapping.organizationalUnitId).toBe(unit.id);
    expect(entraMapping.organizationalUnitId).toBe(unit.id);
    expect(JSON.stringify([localMapping, entraMapping])).not.toContain('hash-must-not-leak');
    expect(JSON.stringify([localMapping, entraMapping])).not.toContain('entra-object-1');
    expect(localMapping).not.toHaveProperty('provider');
    expect(entraMapping).not.toHaveProperty('isLocalOnly');
  });

  it('does not import authentication providers or directory clients', () => {
    const directory = join(__dirname);
    const sources = readdirSync(directory).filter(
      (fileName) =>
        fileName.endsWith('.ts') &&
        !fileName.endsWith('.spec.ts') &&
        fileName !== 'create-in-memory-organizational-unit-prisma.ts',
    );
    for (const fileName of sources) {
      const source = readFileSync(join(directory, fileName), 'utf8');
      expect(source).not.toContain('../authentication');
      expect(source).not.toContain('msal');
      expect(source).not.toContain('graph.microsoft');
      expect(source).not.toContain('AuthenticationMode');
    }
  });
});
