import { describe, expect, it } from 'vitest';
import { ApiError } from '@/services/api';
import { userPasswordResetErrorMessage } from './map-user-admin-action-error';

describe('userPasswordResetErrorMessage', () => {
  const translate = (key: string) => ({
    'users.resetPasswordInactive': 'Aktivirajte nalog prije resetovanja lozinke.',
    'users.resetPasswordFailed': 'Resetovanje lozinke nije uspjelo.',
  })[key] ?? key;

  it('gives an inactive account the targeted instruction to activate it first', () => {
    expect(
      userPasswordResetErrorMessage(
        new ApiError(409, 'USER_INACTIVE', 'Activate the user account before resetting its password.'),
        translate,
      ),
    ).toBe('Aktivirajte nalog prije resetovanja lozinke.');
  });

  it('keeps other API and unexpected failure messages distinct', () => {
    expect(
      userPasswordResetErrorMessage(new ApiError(409, 'OTHER', 'Server message'), translate),
    ).toBe('Server message');
    expect(userPasswordResetErrorMessage(new Error('offline'), translate)).toBe(
      'Resetovanje lozinke nije uspjelo.',
    );
  });
});
