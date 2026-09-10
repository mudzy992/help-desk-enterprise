import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('authorization provider independence', () => {
  const directory = join(__dirname);
  const sources = readdirSync(directory).filter(
    (fileName) =>
      fileName.endsWith('.ts') &&
      !fileName.endsWith('.spec.ts') &&
      !fileName.startsWith('create-test-'),
  );

  it('does not branch on local or entra_ad providers', () => {
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

  it('does not import Entra or local authentication providers', () => {
    for (const fileName of sources) {
      const source = readFileSync(join(directory, fileName), 'utf8');
      expect(source).not.toContain('local-authentication.provider');
      expect(source).not.toContain('entra-authentication.provider');
      expect(source).not.toContain('MicrosoftEntraIdTokenVerifier');
    }
  });
});
