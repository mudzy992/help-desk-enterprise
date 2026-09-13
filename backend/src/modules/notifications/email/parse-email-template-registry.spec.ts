import { parseEmailTemplateRegistry } from './parse-email-template-registry';
import { serializeEmailTemplateRegistry } from './default-email-templates';
import { defaultEmailTemplates } from './default-email-templates';

describe('parseEmailTemplateRegistry', () => {
  it('returns built-in templates for empty input', () => {
    expect(parseEmailTemplateRegistry('')).toEqual(defaultEmailTemplates);
    expect(parseEmailTemplateRegistry(undefined)).toEqual(defaultEmailTemplates);
  });

  it('accepts the serialized default registry', () => {
    expect(
      parseEmailTemplateRegistry(
        serializeEmailTemplateRegistry(defaultEmailTemplates),
      ),
    ).toEqual(defaultEmailTemplates);
  });

  it('overlays a valid template and keeps remaining defaults', () => {
    const parsed = parseEmailTemplateRegistry(
      JSON.stringify({
        'ticket.created': {
          subject: 'New ticket {{ticketNumber}}',
          body: '{{ticketTitle}}',
        },
      }),
    );
    expect(parsed['ticket.created']).toEqual({
      subject: 'New ticket {{ticketNumber}}',
      body: '{{ticketTitle}}',
    });
    expect(parsed['ticket.assigned']).toEqual(
      defaultEmailTemplates['ticket.assigned'],
    );
  });

  it('rejects unknown template keys and placeholders', () => {
    expect(() =>
      parseEmailTemplateRegistry(JSON.stringify({ 'ticket.unknown': { subject: 'x', body: 'y' } })),
    ).toThrow(/Unknown email template key/);
    expect(() =>
      parseEmailTemplateRegistry(
        JSON.stringify({
          'ticket.created': {
            subject: 'Hello {{userName}}',
            body: 'Body',
          },
        }),
      ),
    ).toThrow(/unsupported placeholder/);
  });

  it('rejects invalid JSON and empty subject or body', () => {
    expect(() => parseEmailTemplateRegistry('{')).toThrow(/not valid/);
    expect(() =>
      parseEmailTemplateRegistry(
        JSON.stringify({
          'ticket.created': { subject: '  ', body: 'Body' },
        }),
      ),
    ).toThrow(/non-empty string/);
  });
});
