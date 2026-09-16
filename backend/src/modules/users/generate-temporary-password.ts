import { randomBytes } from 'crypto';

const temporaryPasswordAlphabet =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
const temporaryPasswordLength = 20;

export function generateTemporaryPassword(): string {
  const bytes = randomBytes(temporaryPasswordLength);
  let password = '';
  for (let index = 0; index < temporaryPasswordLength; index += 1) {
    const byte = bytes[index] ?? 0;
    password += temporaryPasswordAlphabet[byte % temporaryPasswordAlphabet.length];
  }
  return password;
}
