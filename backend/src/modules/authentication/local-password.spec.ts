import { hashLocalPassword } from './hash-local-password';
import { verifyLocalPassword } from './verify-local-password';

describe('local password hashing', () => {
  const password = 'correct-horse-battery';

  it('hashes a password without returning the plaintext', async () => {
    const passwordHash = await hashLocalPassword(password, 4);
    expect(passwordHash.startsWith('$2b$')).toBe(true);
    expect(passwordHash).not.toContain(password);
  });

  it('verifies the matching password and rejects a wrong password', async () => {
    const passwordHash = await hashLocalPassword(password, 4);
    await expect(verifyLocalPassword(password, passwordHash)).resolves.toBe(true);
    await expect(
      verifyLocalPassword('wrong-password', passwordHash),
    ).resolves.toBe(false);
  });

  it('does not throw on a malformed hash', async () => {
    await expect(
      verifyLocalPassword(password, 'not-a-bcrypt-hash'),
    ).resolves.toBe(false);
  });

  it('rejects an empty password instead of hashing it', async () => {
    await expect(hashLocalPassword('')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });
});
