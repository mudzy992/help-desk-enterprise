import { hash } from 'bcrypt';
import { authenticationConstants } from './authentication.constants';
import { createInvalidCredentialsError } from './authentication.error';

export async function hashLocalPassword(
  password: string,
  costFactor: number = authenticationConstants.localPasswordCostFactor,
): Promise<string> {
  if (password.length === 0) {
    throw createInvalidCredentialsError();
  }
  return hash(password, costFactor);
}
