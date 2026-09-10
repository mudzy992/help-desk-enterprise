import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('directory sync provider independence', () => {
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
  );
  const productionSources = sources.filter(
    (fileName) => fileName.endsWith('.ts') && !fileName.endsWith('.spec.ts'),
  );

  it('does not import authentication providers, Graph, LDAP, or MSAL', () => {
    for (const fileName of productionSources) {
      const source = readFileSync(join(directory, fileName), 'utf8');
      expect(source).not.toContain('../authentication');
      expect(source).not.toContain('AuthenticationMode');
      expect(source).not.toContain('private.auth.mode');
      expect(source).not.toContain('msal');
      expect(source).not.toContain('graph.microsoft');
      expect(source).not.toContain('ldapjs');
      expect(source).not.toContain('activedirectory');
      expect(source).not.toContain('@azure');
    }
  });

  it('does not branch domain reads on local or entra_ad authentication', () => {
    const forbidden = [
      /if\s*\(\s*authProvider/,
      /provider\s*===\s*['"]local['"]/,
      /provider\s*===\s*['"]entra_ad['"]/,
      /authenticationMode\s*===\s*['"]local['"]/,
      /NODE_ENV/,
    ];
    for (const fileName of productionSources) {
      const source = readFileSync(join(directory, fileName), 'utf8');
      for (const pattern of forbidden) {
        expect(source).not.toMatch(pattern);
      }
    }
  });

  it('does not persist User or OrganizationalUnit records', () => {
    for (const fileName of productionSources) {
      const source = readFileSync(join(directory, fileName), 'utf8');
      expect(source).not.toContain('PrismaService');
      expect(source).not.toContain('prisma.user');
      expect(source).not.toContain('prisma.organizationalUnit');
    }
  });
});
