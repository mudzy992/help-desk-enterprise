import { ConflictException } from '@nestjs/common';
import { mapUsersError } from './map-users-error';
import { UsersError } from './users.error';

describe('mapUsersError', () => {
  it('maps an inactive-account reset to 409 with its stable code and instruction', () => {
    try {
      mapUsersError(new UsersError('USER_INACTIVE'));
      throw new Error('expected mapUsersError to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getStatus()).toBe(409);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'USER_INACTIVE',
        message: 'Activate the user account before resetting its password.',
      });
    }
  });

  it('maps last-active-SuperAdmin rejection to 409 with its stable code', () => {
    try {
      mapUsersError(new UsersError('LAST_SUPER_ADMIN_REQUIRED'));
      throw new Error('expected mapUsersError to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getStatus()).toBe(409);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'LAST_SUPER_ADMIN_REQUIRED',
      });
    }
  });

  it('maps an invalid SuperAdmin target identity to 409 with a stable instruction', () => {
    try {
      mapUsersError(new UsersError('SUPER_ADMIN_LOCAL_IDENTITY_REQUIRED'));
      throw new Error('expected mapUsersError to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getStatus()).toBe(409);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'SUPER_ADMIN_LOCAL_IDENTITY_REQUIRED',
        message: 'SuperAdmin roles require an active local-only account with no linked directory identity.',
      });
    }
  });

  it('maps a directory-account password reset rejection to 409 with its stable code', () => {
    try {
      mapUsersError(new UsersError('DIRECTORY_ACCOUNT_NOT_LOCAL'));
      throw new Error('expected mapUsersError to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getStatus()).toBe(409);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'DIRECTORY_ACCOUNT_NOT_LOCAL',
      });
    }
  });
});
