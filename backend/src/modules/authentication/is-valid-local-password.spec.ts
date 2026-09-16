import { isValidLocalPassword } from './is-valid-local-password';

describe('isValidLocalPassword', () => {
  it('accepts a long password that is not the email', () => {
    expect(
      isValidLocalPassword('correct-horse-battery', 'user@example.com'),
    ).toBe(true);
  });

  it('rejects short passwords and email reuse', () => {
    expect(isValidLocalPassword('short', 'user@example.com')).toBe(false);
    expect(
      isValidLocalPassword('user@example.com', 'user@example.com'),
    ).toBe(false);
  });
});
