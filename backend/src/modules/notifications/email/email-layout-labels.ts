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
