import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { policyPackKeys } from './policy-pack.constants';
import {
  createPolicyPackTestWorld,
  policyPackTestIds,
} from './create-policy-pack-test-world';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('policy pack provider independence', () => {
  const directory = join(__dirname);
  const sources = readdirSync(directory, { withFileTypes: true }).flatMap(
    (entry) => {
      if (entry.isFile()) {
        return [entry.name];
      }
      if (entry.isDirectory() && entry.name === 'dto') {
        return readdirSync(join(directory, 'dto')).map(
          (fileName) => `dto/${fileName}`,
        );
      }
      return [];
    },
  ).filter(
    (fileName) =>
      fileName.endsWith('.ts') &&
      !fileName.endsWith('.spec.ts') &&
      !fileName.startsWith('create-in-memory-') &&
      !fileName.startsWith('create-policy-pack-test-') &&
      !fileName.startsWith('in-memory-') &&
      !fileName.startsWith('map-in-memory-'),
  );

  it('does not branch pack application on local or entra_ad', () => {
    const forbidden = [
      /if\s*\(\s*test\s*\)/,
      /provider\s*===\s*['"]local['"]/,
      /provider\s*===\s*['"]entra_ad['"]/,
      /AuthenticationMode/,
      /NODE_ENV/,
      /msal/,
      /graph\.microsoft/,
    ];
    for (const fileName of sources) {
      const source = readFileSync(join(directory, fileName), 'utf8');
      for (const pattern of forbidden) {
        expect(source).not.toMatch(pattern);
      }
    }
  });

  it('does not import local or Entra authentication providers', () => {
    for (const fileName of sources) {
      const source = readFileSync(join(directory, fileName), 'utf8');
      expect(source).not.toContain('local-authentication.provider');
      expect(source).not.toContain('entra-authentication.provider');
      expect(source).not.toContain('MicrosoftEntraIdTokenVerifier');
    }
  });

  it('applies the same UserRole grants to local and Entra-linked users', async () => {
    const { memory, service } = createPolicyPackTestWorld();
    await service.apply({
      packKey: policyPackKeys.itStandard,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      userIds: [policyPackTestIds.localUser, policyPackTestIds.entraUser],
    });
    const localAssignments = memory.assignmentsForUser(policyPackTestIds.localUser);
    const entraAssignments = memory.assignmentsForUser(policyPackTestIds.entraUser);
    expect(localAssignments.map((item) => item.roleKey).sort()).toEqual(
      entraAssignments.map((item) => item.roleKey).sort(),
    );
    expect(JSON.stringify(localAssignments)).not.toContain('entra-object-1');
    expect(JSON.stringify(entraAssignments)).not.toContain('provider');
  });
});
