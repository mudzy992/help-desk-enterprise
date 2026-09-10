import { redactIfSecret, redactedSecretPlaceholder } from './settings.redaction';

describe('redactIfSecret', () => {
  it('redacts secret values and leaves public/private values intact', () => {
    expect(redactIfSecret('secret', 'plaintext-secret')).toBe(
      redactedSecretPlaceholder,
    );
    expect(redactIfSecret('public', 'EP-HelpDesk')).toBe('EP-HelpDesk');
    expect(redactIfSecret('private', 'local')).toBe('local');
  });
});
