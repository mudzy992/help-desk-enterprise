import { scanTextForRedaction } from './detect-sensitive-content';
import { defaultTicketRedactionConfiguration } from './redaction.constants';
import { redactSensitiveText } from './redact-sensitive-text';

describe('ticket content redaction', () => {
  it('warns on password assignment without blocking in warn_only', () => {
    const scan = scanTextForRedaction(
      'ticket_description',
      'password: hunter2-please',
      defaultTicketRedactionConfiguration,
    );
    expect(scan.matches.map((item) => item.patternId)).toContain(
      'password_assignment',
    );
    expect(scan.blocked).toBe(false);
  });

  it('blocks high-risk matches in soft_block mode', () => {
    const scan = scanTextForRedaction(
      'chat_message',
      'api_key=AKIATESTKEYVALUE12',
      {
        ...defaultTicketRedactionConfiguration,
        mode: 'soft_block',
      },
    );
    expect(scan.blocked).toBe(true);
  });

  it('redacts matched secrets for logs and snapshots', () => {
    const redacted = redactSensitiveText(
      'token bearer abcdefghijklmnop1234 remains',
      defaultTicketRedactionConfiguration,
    );
    expect(redacted).toContain('[REDACTED]');
    expect(redacted).not.toContain('abcdefghijklmnop1234');
  });
});
