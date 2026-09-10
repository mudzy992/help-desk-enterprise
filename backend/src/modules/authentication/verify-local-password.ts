import { compare } from 'bcrypt';

export async function verifyLocalPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  if (password.length === 0 || passwordHash.length === 0) {
    return false;
  }
  try {
    return await compare(password, passwordHash);
  } catch {
    return false;
  }
}
