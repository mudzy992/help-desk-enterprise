import { defaultEmailTemplates } from './default-email-templates';
import { renderEmailMessage, resolveAccent, type RenderEmailMessageInput } from './render-email-message';

function input(overrides: Partial<RenderEmailMessageInput> = {}): RenderEmailMessageInput {
  return {
    template: defaultEmailTemplates.bs['ticket.message'],
    locale: 'bs',
    variables: {
      ticketNumber: 'HD-7',
      ticketTitle: 'Printer <b>ne radi</b>',
      actorName: 'Amra',
      groupName: 'IT',
    },
    appName: 'EP-HelpDesk',
    accentColor: '#4f46e5',
    confidential: false,
    ticket: {
      number: 'HD-7',
      title: 'Printer <b>ne radi</b>',
      serviceName: 'Štampači',
      statusLabel: 'U radu',
      priorityLabel: 'Visok',
    },
    excerpt: 'Probajte <script>alert(1)</script> ponovo',
    ctaUrl: 'https://desk.epbih.ba/tickets/t1',
    replyMode: 'no_reply',
    ...overrides,
  };
}

describe('renderEmailMessage', () => {
  it('prefixes the ticket number once and keeps the subject on one line', () => {
    const rendered = renderEmailMessage(input());
    expect(rendered.subject).toBe('[HD-7] Nova poruka: Printer <b>ne radi</b>');
    const legacy = renderEmailMessage(
      input({
        template: { ...defaultEmailTemplates.bs['ticket.message'], subject: '{{ticketNumber}}\r\nBcc: x@evil.org' },
      }),
    );
    expect(legacy.subject).toBe('HD-7 Bcc: x@evil.org');
    expect(legacy.subject).not.toMatch(/[\r\n]/);
  });

  it('escapes every variable in the HTML part', () => {
    const { html } = renderEmailMessage(input());
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>ne radi</b>');
    expect(html).toContain('Printer &lt;b&gt;ne radi&lt;/b&gt;');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('renders the card, excerpt, button, fallback link and no-reply footer', () => {
    const { html, text } = renderEmailMessage(input());
    expect(html).toContain('Štampači');
    expect(html).toContain('href="https://desk.epbih.ba/tickets/t1"');
    expect(html).toContain('Ako dugme ne radi');
    expect(html).toContain('Ne odgovarajte');
    expect(html).toContain('<!--[if mso]>');
    expect(text).toContain('Pogledaj i odgovori: https://desk.epbih.ba/tickets/t1');
    expect(text).toContain('> Probajte');
    expect(text).toContain('Ne odgovarajte');
  });

  it('hides title, service, excerpt and uses the confidential subject (E3)', () => {
    const rendered = renderEmailMessage(input({ confidential: true }));
    expect(rendered.subject).toBe('[HD-7] Nova poruka na tiketu');
    for (const part of [rendered.html, rendered.text, rendered.subject]) {
      expect(part).not.toContain('Printer');
      expect(part).not.toContain('Štampači');
      expect(part).not.toContain('Probajte');
    }
    expect(rendered.html).toContain('Povjerljivo');
    expect(rendered.text).toContain('https://desk.epbih.ba/tickets/t1');
  });

  it('omits the button when there is no safe public URL', () => {
    for (const ctaUrl of [null, 'javascript:alert(1)', 'not a url']) {
      const { html, text } = renderEmailMessage(input({ ctaUrl }));
      expect(html).not.toContain('<a href=');
      expect(html).not.toContain('javascript:');
      expect(text).not.toContain('Pogledaj i odgovori:');
    }
  });

  it('switches the footer for the shared mailbox mode and the English locale', () => {
    expect(renderEmailMessage(input({ replyMode: 'shared_mailbox' })).text).toContain(
      'Na ovu poruku možete odgovoriti',
    );
    const english = renderEmailMessage(
      input({ locale: 'en', template: defaultEmailTemplates.en['ticket.message'] }),
    );
    expect(english.subject).toBe('[HD-7] New message: Printer <b>ne radi</b>');
    expect(english.html).toContain('lang="en"');
    expect(english.text).toContain('Do not reply');
  });

  it('truncates long excerpts', () => {
    const { text } = renderEmailMessage(input({ excerpt: 'a'.repeat(2000) }));
    expect(text).toContain('…');
    expect(text).not.toContain('a'.repeat(700));
  });
});

describe('per-template accent colour', () => {
  it('overrides the installation colour and falls back when empty', () => {
    const green = renderEmailMessage(
      input({ template: defaultEmailTemplates.bs['ticket.resolved'] }),
    );
    expect(green.html).toContain('border-bottom:3px solid #16a34a');
    expect(renderEmailMessage(input()).html).toContain('border-bottom:3px solid #4f46e5');
  });
});

describe('resolveAccent', () => {
  it('keeps white text on dark accents and switches to dark text on light ones', () => {
    expect(resolveAccent('#4f46e5')).toEqual({ background: '#4f46e5', foreground: '#ffffff' });
    expect(resolveAccent('#fde047').foreground).toBe('#111827');
    expect(resolveAccent('red').background).toBe('#4f46e5');
  });
});
