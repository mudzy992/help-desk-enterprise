import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAuthenticatedPrincipal } from './create-authenticated-principal';
import { toAuthorizationPrincipal } from './to-authorization-principal';
import type { AuthenticatedPrincipal } from './authentication.types';

const authorizationFacingFiles = [
  'create-authenticated-principal.ts',
  'to-authorization-principal.ts',
  'authentication.service.ts',
  'assert-super-admin-is-local-only.ts',
] as const;

describe('normalized principal', () => {
  it('creates a provider-neutral principal', () => {
    const principal = createAuthenticatedPrincipal({
      subjectId: ' user-1 ',
      email: 'Agent@Example.com',
      displayName: ' Agent Name ',
      isLocalOnly: true,
    });
    expect(principal).toEqual({
      subjectId: 'user-1',
      email: 'agent@example.com',
      displayName: 'Agent Name',
      isLocalOnly: true,
    });
    expect(principal).not.toHaveProperty('provider');
    expect(principal).not.toHaveProperty('localPasswordHash');
  });

  it('strips infrastructure fields before authorization', () => {
    const principal = {
      subjectId: 'user-1',
      email: 'agent@example.com',
      displayName: 'Agent',
      isLocalOnly: false,
      provider: 'entra_ad',
      token: 'must-not-leak',
    } as AuthenticatedPrincipal;
    const authorizationPrincipal = toAuthorizationPrincipal(principal);
    expect(authorizationPrincipal).toEqual({
      subjectId: 'user-1',
      email: 'agent@example.com',
      displayName: 'Agent',
      isLocalOnly: false,
    });
    expect(authorizationPrincipal).not.toHaveProperty('provider');
    expect(authorizationPrincipal).not.toHaveProperty('token');
  });

  it('keeps authorization-facing code free of provider branching', () => {
    const forbidden = [
      /if\s*\(\s*test\s*\)/,
      /provider\s*===\s*['"]local['"]/,
      /provider\s*===\s*['"]entra_ad['"]/,
      /NODE_ENV/,
    ];
    for (const fileName of authorizationFacingFiles) {
      const source = readFileSync(join(__dirname, fileName), 'utf8');
      for (const pattern of forbidden) {
        expect(source).not.toMatch(pattern);
      }
    }
  });
});
