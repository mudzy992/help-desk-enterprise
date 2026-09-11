import { parseTicketSafeLoggingConfiguration } from './parse-ticket-safe-logging-configuration';

describe('parseTicketSafeLoggingConfiguration', () => {
  it('keeps defaults when disabled', () => {
    expect(
      parseTicketSafeLoggingConfiguration({
        enabled: false,
        levelsCsv: 'CONFIDENTIAL',
        redactFieldsCsv: 'ticket_title',
      }).enabled,
    ).toBe(false);
  });

  it('parses classification levels and redact fields', () => {
    const parsed = parseTicketSafeLoggingConfiguration({
      enabled: true,
      levelsCsv: 'CONFIDENTIAL,RESTRICTED',
      redactFieldsCsv: 'ticket_title,ticket_description,chat_message',
    });
    expect(parsed.levels).toEqual(['CONFIDENTIAL', 'RESTRICTED']);
    expect(parsed.redactFields).toContain('ticket_title');
  });
});
