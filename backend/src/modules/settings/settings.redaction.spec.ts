import { redactIfSecret, redactedSecretPlaceholder } from './settings.redaction';

describe('redactIfSecret', () => {
  it('redacts secret values and leaves public/private values intact', () => {
    expect(redactIfSecret('secret', 'plaintext-secret')).toBe(
      redactedSecretPlaceholder,
    );
    expect(redactIfSecret('public', 'Service Desk')).toBe('Service Desk');
    expect(redactIfSecret('private', 'local')).toBe('local');
  });
});
