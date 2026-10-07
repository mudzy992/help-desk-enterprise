import { ApiError } from '@/services/api';

type UserAdminActionErrorTranslationKey =
  | 'users.resetPasswordInactive'
  | 'users.resetPasswordFailed';

export function userPasswordResetErrorMessage(
  error: unknown,
  translate: (key: UserAdminActionErrorTranslationKey) => string,
): string {
  if (error instanceof ApiError && error.code === 'USER_INACTIVE') {
    return translate('users.resetPasswordInactive');
  }
  if (error instanceof ApiError) {
    return error.message;
  }
  return translate('users.resetPasswordFailed');
}
