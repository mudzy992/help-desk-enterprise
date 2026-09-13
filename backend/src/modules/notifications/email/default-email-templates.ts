import type { EmailTemplateRegistry } from './email-template.types';

export const defaultEmailTemplates: EmailTemplateRegistry = {
  'ticket.created': {
    subject: 'Novi tiket {{ticketNumber}}',
    body: 'Kreiran je tiket {{ticketNumber}}: {{ticketTitle}}',
  },
  'ticket.assigned': {
    subject: 'Dodijeljen tiket {{ticketNumber}}',
    body: 'Tiket {{ticketNumber}} je dodijeljen vama: {{ticketTitle}}',
  },
  'ticket.message': {
    subject: 'Nova poruka na {{ticketNumber}}',
    body: 'Nova poruka na tiketu {{ticketNumber}}: {{ticketTitle}}',
  },
  'ticket.resolved': {
    subject: 'Tiket {{ticketNumber}} je riješen',
    body: 'Tiket {{ticketNumber}} je označen kao riješen: {{ticketTitle}}',
  },
  'ticket.closed': {
    subject: 'Tiket {{ticketNumber}} je zatvoren',
    body: 'Tiket {{ticketNumber}} je zatvoren: {{ticketTitle}}',
  },
  'ticket.approval': {
    subject: 'Čeka odobrenje: {{ticketNumber}}',
    body: 'Tiket {{ticketNumber}} čeka odobrenje: {{ticketTitle}}',
  },
  'ticket.sla': {
    subject: 'SLA događaj: {{ticketNumber}}',
    body: 'SLA događaj na tiketu {{ticketNumber}}: {{ticketTitle}}',
  },
  'remote.requested': {
    subject: 'Zahtjev za udaljenu podršku: {{ticketNumber}}',
    body: 'Zatražena je udaljena podrška za tiket {{ticketNumber}}.',
  },
};

export function serializeEmailTemplateRegistry(
  templates: EmailTemplateRegistry,
): string {
  return JSON.stringify(templates);
}
