import {
  diffEmailTemplateRegistry,
  parseEmailTemplateRegistry,
} from './parse-email-template-registry';
import {
  defaultEmailTemplates,
  serializeEmailTemplateRegistry,
} from './default-email-templates';
import { emailLocales, emailTemplateFields, emailTemplateKeys } from './email-template.constants';

describe('parseEmailTemplateRegistry', () => {
  it('returns built-in templates for empty input', () => {
    expect(parseEmailTemplateRegistry('')).toEqual(defaultEmailTemplates);
    expect(parseEmailTemplateRegistry(undefined)).toEqual(defaultEmailTemplates);
  });

  it('ships complete bs and en texts for every key and field', () => {
    for (const locale of emailLocales) {
      for (const key of emailTemplateKeys) {
        for (const field of emailTemplateFields) {
          if (field === 'footer' || field === 'accentColor') {
            continue;
          }
          expect(defaultEmailTemplates[locale][key][field].trim()).not.toBe('');
        }
        // E3: the confidential subject never carries the title.
        expect(defaultEmailTemplates[locale][key].subjectConfidential).not.toContain(
          '{{ticketTitle}}',
        );
      }
    }
  });

  it('round-trips the serialized v2 registry', () => {
    expect(
      parseEmailTemplateRegistry(serializeEmailTemplateRegistry(defaultEmailTemplates)),
    ).toEqual(defaultEmailTemplates);
  });

  it('merges v2 overrides field by field and keeps the rest', () => {
    const parsed = parseEmailTemplateRegistry(
      JSON.stringify({
        version: 2,
        locales: { en: { 'ticket.created': { heading: 'Heads up' } } },
      }),
    );
    expect(parsed.en['ticket.created'].heading).toBe('Heads up');
    expect(parsed.en['ticket.created'].subject).toBe(
      defaultEmailTemplates.en['ticket.created'].subject,
    );
    expect(parsed.bs).toEqual(defaultEmailTemplates.bs);
  });

  it('reads a legacy v1 registry as Bosnian overrides', () => {
    const parsed = parseEmailTemplateRegistry(
      JSON.stringify({
        'ticket.created': { subject: 'New ticket {{ticketNumber}}', body: '{{ticketTitle}}' },
      }),
    );
    expect(parsed.bs['ticket.created']).toMatchObject({
      subject: 'New ticket {{ticketNumber}}',
      body: '{{ticketTitle}}',
      heading: defaultEmailTemplates.bs['ticket.created'].heading,
    });
    expect(parsed.en).toEqual(defaultEmailTemplates.en);
  });

  it('rejects unknown keys, locales, fields and placeholders', () => {
    expect(() =>
      parseEmailTemplateRegistry(JSON.stringify({ 'ticket.unknown': { subject: 'x' } })),
    ).toThrow(/Unknown email template key/);
    expect(() =>
      parseEmailTemplateRegistry(JSON.stringify({ version: 2, locales: { de: {} } })),
    ).toThrow(/Unknown email template locale/);
    expect(() =>
      parseEmailTemplateRegistry(
        JSON.stringify({ version: 2, locales: { bs: { 'ticket.created': { color: 'x' } } } }),
      ),
    ).toThrow(/unknown field/);
    expect(() =>
      parseEmailTemplateRegistry(
        JSON.stringify({ 'ticket.created': { subject: 'Hello {{userName}}' } }),
      ),
    ).toThrow(/unsupported placeholder/);
  });

  it('rejects invalid JSON and empty required fields but allows an empty footer', () => {
    expect(() => parseEmailTemplateRegistry('{')).toThrow(/not valid/);
    expect(() =>
      parseEmailTemplateRegistry(JSON.stringify({ 'ticket.created': { subject: '  ' } })),
    ).toThrow(/must not be empty/);
    expect(
      parseEmailTemplateRegistry(JSON.stringify({ 'ticket.created': { footer: '' } })).bs[
        'ticket.created'
      ].footer,
    ).toBe('');
  });

  it('validates the accent colour field', () => {
    expect(() =>
      parseEmailTemplateRegistry(JSON.stringify({ 'ticket.created': { accentColor: 'green' } })),
    ).toThrow(/#rrggbb/);
    expect(
      parseEmailTemplateRegistry(JSON.stringify({ 'ticket.resolved': { accentColor: '' } })).bs[
        'ticket.resolved'
      ].accentColor,
    ).toBe('');
  });

  it('diffs only what differs from the defaults', () => {
    const parsed = parseEmailTemplateRegistry(
      JSON.stringify({ version: 2, locales: { en: { 'ticket.sla': { cta: 'Act now' } } } }),
    );
    expect(diffEmailTemplateRegistry(parsed)).toEqual({ en: { 'ticket.sla': { cta: 'Act now' } } });
    expect(diffEmailTemplateRegistry(defaultEmailTemplates)).toEqual({});
  });
});
