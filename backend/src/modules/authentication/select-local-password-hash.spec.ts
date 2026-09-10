import { authenticationConstants } from './authentication.constants';
import type { AuthenticationUserRecord } from './authentication.types';
import {
  isAcceptedLocalPasswordAuthentication,
  selectLocalPasswordHashForVerification,
} from './select-local-password-hash';

function createUser(
  overrides: Partial<AuthenticationUserRecord> = {},
): AuthenticationUserRecord {
  return {
    id: 'user-1',
    email: 'agent@example.com',
    displayName: 'Agent',
    isActive: true,
    isLocalOnly: false,
    localPasswordHash: '$2b$04$local-password-hash',
    entraObjectId: null,
    roleKeys: [],
    ...overrides,
  };
}

describe('selectLocalPasswordHashForVerification', () => {
  it('uses the dummy hash when the user is missing', () => {
    expect(selectLocalPasswordHashForVerification(null, false)).toBe(
      authenticationConstants.dummyLocalPasswordHash,
    );
  });

  it('uses the dummy hash for non-local users when local-only is required', () => {
    const user = createUser({ isLocalOnly: false });
    expect(selectLocalPasswordHashForVerification(user, true)).toBe(
      authenticationConstants.dummyLocalPasswordHash,
    );
    expect(
      isAcceptedLocalPasswordAuthentication(user, true, true),
    ).toBe(false);
  });

  it('returns the stored hash for an eligible local user', () => {
    const user = createUser({ isLocalOnly: true });
    expect(selectLocalPasswordHashForVerification(user, true)).toBe(
      user.localPasswordHash,
    );
    expect(
      isAcceptedLocalPasswordAuthentication(user, true, true),
    ).toBe(true);
  });
});
