import { ConflictException } from '@nestjs/common';
import { mapUsersError } from './map-users-error';
import { UsersError } from './users.error';

describe('mapUsersError', () => {
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
