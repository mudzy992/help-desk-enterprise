import { escapeHtml } from '../notifications/email/render-email-message';
import type { EmailLocale } from '../notifications/email/email-template.constants';
import type { InboundNoticeKind } from './process-inbound-message';

const texts: Readonly<Record<EmailLocale, Readonly<Record<InboundNoticeKind, { subject: string; body: string }>>>> = {
  bs: {
    ticket_closed: {
      subject: 'Tiket je zatvoren — vaš odgovor nije dodan',
      body: 'Primili smo vaš e-mail, ali tiket {number} je zatvoren pa odgovor nije dodan. Ako problem i dalje postoji, otvorite novi tiket u aplikaciji.',
    },
    reply_blocked: {
      subject: 'Vaš odgovor nije dodan na tiket',
      body: 'Vaš e-mail za tiket {number} nije dodan jer sadrži podatke koji se ne smiju slati (npr. lozinke ili brojeve kartica). Otvorite tiket u aplikaciji i pošaljite odgovor bez tih podataka.',
    },
  },
  en: {
    ticket_closed: {
      subject: 'Ticket is closed — your reply was not added',
      body: 'We received your e-mail, but ticket {number} is closed, so the reply was not added. If the problem persists, please open a new ticket in the application.',
    },
    reply_blocked: {
      subject: 'Your reply was not added to the ticket',
      body: 'Your e-mail for ticket {number} was not added because it contains data that must not be sent (e.g. passwords or card numbers). Open the ticket in the application and send the reply without that data.',
    },
  },
};

const linkLabel: Readonly<Record<EmailLocale, string>> = { bs: 'Otvori aplikaciju', en: 'Open the application' };

/**
 * Paket 2.3 (R7/R8): short informational answer to a verified internal sender.
 * It never quotes the original message and carries RFC 3834 headers so the
 * sender's autoresponder does not answer back.
 */
export function composeInboundNoticeEmail(input: {
  readonly kind: InboundNoticeKind;
  readonly locale: EmailLocale;
  readonly ticketNumber: string;
  readonly url: string | null;
}): { readonly subject: string; readonly text: string; readonly html: string; readonly headers: Record<string, string> } {
  const template = texts[input.locale][input.kind];
  const body = template.body.replace('{number}', input.ticketNumber);
  const subject = `[${input.ticketNumber}] ${template.subject}`;
  const text = input.url === null ? body : `${body}\n\n${linkLabel[input.locale]}: ${input.url}`;
  const link =
    input.url === null
      ? ''
      : `<p><a href="${escapeHtml(input.url)}">${escapeHtml(linkLabel[input.locale])}</a></p>`;
  const html = `<!doctype html><html><body style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5"><p>${escapeHtml(body)}</p>${link}</body></html>`;
  return {
    subject,
    text,
    html,
    headers: { 'Auto-Submitted': 'auto-replied', 'X-Auto-Response-Suppress': 'All' },
  };
}
