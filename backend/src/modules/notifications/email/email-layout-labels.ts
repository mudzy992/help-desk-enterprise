import type { EmailLocale } from './email-template.constants';

/** Fixed layout copy (not admin-editable, decision E1), per locale. */
export type EmailLayoutLabels = {
  readonly confidential: string;
  readonly ticket: string;
  readonly title: string;
  readonly service: string;
  readonly status: string;
  readonly priority: string;
  readonly message: string;
  readonly linkFallback: string;
  readonly footerNoReply: string;
  readonly footerReply: string;
  readonly footerReason: string;
  /** Paket 2.2: footer link to the personal notification settings. */
  readonly manageNotifications: string;
  readonly digestFooterReason: string;
  readonly digestMore: string;
  readonly digestEventCount: string;
  readonly digestCategories: Readonly<Record<string, string>>;
  readonly statuses: Readonly<Record<string, string>>;
  readonly priorities: Readonly<Record<string, string>>;
};

export const emailLayoutLabels: Readonly<Record<EmailLocale, EmailLayoutLabels>> = {
  bs: {
    confidential: 'Povjerljivo',
    ticket: 'Tiket',
    title: 'Naslov',
    service: 'Usluga',
    status: 'Status',
    priority: 'Prioritet',
    message: 'Poruka',
    linkFallback: 'Ako dugme ne radi, otvorite ovaj link:',
    footerNoReply:
      'Ovo je automatska poruka. Ne odgovarajte na nju — odgovorite u aplikaciji.',
    footerReply:
      'Na ovu poruku možete odgovoriti e-mailom ili u aplikaciji. Broj tiketa u naslovu ne mijenjajte.',
    footerReason: 'Ovu poruku ste primili jer ste učesnik na tiketu.',
    manageNotifications: 'Upravljajte obavještenjima',
    digestFooterReason: 'Ovaj sažetak dobijate prema vašim postavkama obavještenja.',
    digestMore: 'i još {count} tiketa — otvorite listu tiketa u aplikaciji.',
    digestEventCount: 'događaja: {count}',
    digestCategories: {
      'ticket.created': 'Novi tiket',
      'ticket.assigned': 'Dodijeljen vama',
      'ticket.forwarded': 'Proslijeđen',
      'ticket.message': 'Nova poruka',
      'ticket.outcome': 'Riješen / zatvoren',
      'ticket.approval': 'Odobrenje',
      'ticket.sla': 'SLA eskalacija',
      'remote.requested': 'Daljinski pristup',
    },
    statuses: {
      UNROUTED: 'Nerutiran',
      PENDING: 'Na čekanju',
      PENDING_APPROVAL: 'Čeka odobrenje',
      ASSIGNED: 'Dodijeljen',
      IN_PROGRESS: 'U radu',
      WAITING_FOR_USER: 'Čeka korisnika',
      RESOLVED: 'Riješen',
      CLOSED: 'Zatvoren',
      ARCHIVED: 'Arhiviran',
    },
    priorities: { LOW: 'Nizak', MEDIUM: 'Srednji', HIGH: 'Visok', CRITICAL: 'Kritičan' },
  },
  en: {
    confidential: 'Confidential',
    ticket: 'Ticket',
    title: 'Title',
    service: 'Service',
    status: 'Status',
    priority: 'Priority',
    message: 'Message',
    linkFallback: 'If the button does not work, open this link:',
    footerNoReply:
      'This is an automated message. Do not reply to it — reply in the application.',
    footerReply:
      'You can reply to this message by e-mail or in the application. Keep the ticket number in the subject.',
    footerReason: 'You received this message because you take part in the ticket.',
    manageNotifications: 'Manage notifications',
    digestFooterReason: 'You receive this digest because of your notification settings.',
    digestMore: 'and {count} more tickets — open the ticket list in the application.',
    digestEventCount: 'events: {count}',
    digestCategories: {
      'ticket.created': 'New ticket',
      'ticket.assigned': 'Assigned to you',
      'ticket.forwarded': 'Forwarded',
      'ticket.message': 'New message',
      'ticket.outcome': 'Resolved / closed',
      'ticket.approval': 'Approval',
      'ticket.sla': 'SLA escalation',
      'remote.requested': 'Remote access',
    },
    statuses: {
      UNROUTED: 'Unrouted',
      PENDING: 'Pending',
      PENDING_APPROVAL: 'Pending approval',
      ASSIGNED: 'Assigned',
      IN_PROGRESS: 'In progress',
      WAITING_FOR_USER: 'Waiting for user',
      RESOLVED: 'Resolved',
      CLOSED: 'Closed',
      ARCHIVED: 'Archived',
    },
    priorities: { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical' },
  },
};
