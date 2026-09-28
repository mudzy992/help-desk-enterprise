import type {
  EmailTemplateContent,
  EmailTemplateRegistry,
  EmailTemplateSet,
} from './email-template.types';

/*
  Built-in texts (decision E1). Ticket subjects do not repeat the ticket
  number: the renderer always prefixes `[<number>] ` (E6), so the subject is
  consistent even when an admin edits it. Confidential subjects never contain
  the title (E3).
*/

function content(
  subject: string,
  subjectConfidential: string,
  heading: string,
  body: string,
  cta: string,
  accentColor = '',
): EmailTemplateContent {
  return { subject, subjectConfidential, heading, body, cta, footer: '', accentColor };
}

// Status colours (empty = installation accent). AA contrast of the button text
// is enforced by the renderer, so any colour stays readable.
const green = '#16a34a';
const slate = '#475569';
const red = '#dc2626';
const amber = '#b45309';

const bs: EmailTemplateSet = {
  'ticket.created': content(
    'Novi tiket: {{ticketTitle}}',
    'Novi tiket',
    'Novi tiket u vašem redu',
    'Tiket {{ticketNumber}} je kreiran i dodijeljen grupi {{groupName}}.',
    'Otvori tiket',
  ),
  'ticket.assigned': content(
    'Dodijeljen vam je tiket: {{ticketTitle}}',
    'Dodijeljen vam je tiket',
    'Tiket je dodijeljen vama',
    'Poštovani/a {{recipientName}}, tiket {{ticketNumber}} je dodijeljen vama.',
    'Otvori tiket',
  ),
  'ticket.message': content(
    'Nova poruka: {{ticketTitle}}',
    'Nova poruka na tiketu',
    'Nova poruka na tiketu',
    '{{actorName}} je dodao/la novu poruku na tiket {{ticketNumber}}.',
    'Pogledaj i odgovori',
  ),
  'ticket.mentioned': content(
    'Spomenuti ste: {{ticketTitle}}',
    'Spomenuti ste u internoj bilješci',
    'Kolega traži vašu pažnju',
    '{{actorName}} vas je spomenuo/la u internoj bilješci na tiketu {{ticketNumber}}.',
    'Otvori bilješku',
  ),
  'ticket.resolved': content(
    'Tiket je riješen: {{ticketTitle}}',
    'Tiket je riješen',
    'Vaš tiket je riješen',
    'Tiket {{ticketNumber}} je označen kao riješen. Ako problem nije otklonjen, možete ga ponovo otvoriti u aplikaciji.',
    'Pogledaj rješenje',
    green,
  ),
  'ticket.closed': content(
    'Tiket je zatvoren: {{ticketTitle}}',
    'Tiket je zatvoren',
    'Tiket je zatvoren',
    'Tiket {{ticketNumber}} je zatvoren.',
    'Otvori tiket',
    slate,
  ),
  'ticket.approval': content(
    'Čeka vaše odobrenje: {{ticketTitle}}',
    'Tiket čeka vaše odobrenje',
    'Potrebno je vaše odobrenje',
    'Tiket {{ticketNumber}} čeka vašu odluku.',
    'Odobri ili odbij',
    amber,
  ),
  'ticket.sla': content(
    'SLA upozorenje: {{ticketTitle}}',
    'SLA upozorenje',
    'SLA rok je ugrožen',
    'Tiket {{ticketNumber}} je blizu ili preko SLA roka.',
    'Otvori tiket',
    red,
  ),
  'remote.requested': content(
    'Zahtjev za udaljenu podršku',
    'Zahtjev za udaljenu podršku',
    'Zahtjev za udaljenu podršku',
    'Za tiket {{ticketNumber}} zatražena je udaljena podrška. Pokrenite Quick Assist prema uputama u aplikaciji.',
    'Otvori tiket',
  ),
  'ticket.forwarded': content(
    'Tiket je proslijeđen: {{ticketTitle}}',
    'Tiket je proslijeđen',
    'Tiket je proslijeđen',
    'Tiket {{ticketNumber}} je proslijeđen timu koji će ga dalje rješavati.',
    'Otvori tiket',
  ),
  'ticket.broadcast': content(
    'Obavještenje: {{ticketTitle}}',
    'Obavještenje o tiketu',
    'Obavještenje o vašem tiketu',
    'Tim podrške šalje obavještenje za tiket {{ticketNumber}}.',
    'Otvori tiket',
  ),
  'report.weekly_tickets': content(
    'Sedmični pregled vaših tiketa ({{ticketCount}}, prekoračeno {{overdueCount}})',
    'Sedmični pregled vaših tiketa ({{ticketCount}})',
    'Vaši otvoreni tiketi — {{weekLabel}}',
    'Poštovani/a {{recipientName}}, ovo su otvoreni tiketi u kojima učestvujete ({{ticketCount}}). Tiketi s prekoračenim SLA rokom su na vrhu.',
    'Otvori moje tikete',
  ),
  'report.scheduled': content(
    '{{reportName}} — {{reportPeriod}}',
    '{{reportName}} — {{reportPeriod}}',
    '{{reportName}}',
    'Poštovani/a {{recipientName}}, ovo je izvještaj za period {{reportPeriod}} ({{reportScope}}). Brojevi su poređeni s prethodnim periodom iste dužine.',
    'Otvori u aplikaciji',
  ),
  'privacy.retention_weekly': content(
    'Zadržavanje podataka: sažetak za {{reportPeriod}}',
    'Zadržavanje podataka: sažetak za {{reportPeriod}}',
    'Sedmični sažetak brisanja po politici zadržavanja',
    'Poštovani/a {{recipientName}}, u periodu {{reportPeriod}} politika zadržavanja je uklonila podatke navedene u tabeli. Sadržaj nije u poruci; spisak tiketa je u izvještaju u aplikaciji.',
    'Otvori izvještaje',
  ),
  'privacy.erasure_completed': content(
    'Anonimizacija završena: {{reportName}}',
    'Anonimizacija završena: {{reportName}}',
    'Anonimizacija je završena',
    'Poštovani/a {{recipientName}}, anonimizacija koju ste pokrenuli ili odobrili je završena. Korisnik se od sada prikazuje kao {{reportName}}. Brojevi po tabelama su u nastavku.',
    'Otvori privatnost',
  ),
  'report.schedule_paused': content(
    'Zakazani izvještaj je pauziran: {{reportName}}',
    'Zakazani izvještaj je pauziran: {{reportName}}',
    'Zakazani izvještaj je pauziran',
    'Poštovani/a {{recipientName}}, izvještaj „{{reportName}}” više nema primalaca jer je posljednji primalac uklonjen (anonimizacija bivšeg zaposlenika), pa je slanje pauzirano. Dodajte primaoce i ponovo ga uključite.',
    'Otvori zakazane izvještaje',
  ),
  'ops.alert': content(
    '[{{reportPeriod}}] {{reportName}}',
    '[{{reportPeriod}}] {{reportName}}',
    '{{reportName}}',
    'Poštovani/a {{recipientName}}, nadzor sistema {{appName}} javlja: {{reportName}} ({{reportPeriod}}). Detalji i preporučeni prvi korak su u nastavku.',
    'Otvori zdravlje sistema',
  ),
  'notification.digest': content(
    'Sažetak obavještenja ({{itemCount}})',
    'Sažetak obavještenja ({{itemCount}})',
    'Vaš sažetak obavještenja',
    'Poštovani/a {{recipientName}}, ovo su tiketi s novim događajima od posljednjeg sažetka.',
    'Otvori tikete',
  ),
  'user.temporary_password': content(
    'Privremena lozinka za {{appName}}',
    'Privremena lozinka za {{appName}}',
    'Vaš nalog je spreman',
    'Poštovani/a {{displayName}}, kreiran vam je nalog ({{email}}).\n\nPrivremena lozinka: {{temporaryPassword}}\n\nPri prvoj prijavi morate promijeniti lozinku.',
    'Prijavi se',
  ),
};

const en: EmailTemplateSet = {
  'ticket.created': content(
    'New ticket: {{ticketTitle}}',
    'New ticket',
    'A new ticket in your queue',
    'Ticket {{ticketNumber}} was created and assigned to {{groupName}}.',
    'Open ticket',
  ),
  'ticket.assigned': content(
    'Ticket assigned to you: {{ticketTitle}}',
    'A ticket was assigned to you',
    'A ticket was assigned to you',
    'Dear {{recipientName}}, ticket {{ticketNumber}} was assigned to you.',
    'Open ticket',
  ),
  'ticket.message': content(
    'New message: {{ticketTitle}}',
    'New message on a ticket',
    'New message on your ticket',
    '{{actorName}} added a new message to ticket {{ticketNumber}}.',
    'View and reply',
  ),
  'ticket.mentioned': content(
    'You were mentioned: {{ticketTitle}}',
    'You were mentioned in an internal note',
    'A colleague needs your attention',
    '{{actorName}} mentioned you in an internal note on ticket {{ticketNumber}}.',
    'Open the note',
  ),
  'ticket.resolved': content(
    'Ticket resolved: {{ticketTitle}}',
    'Ticket resolved',
    'Your ticket was resolved',
    'Ticket {{ticketNumber}} was marked as resolved. If the problem persists, you can reopen it in the application.',
    'View resolution',
    green,
  ),
  'ticket.closed': content(
    'Ticket closed: {{ticketTitle}}',
    'Ticket closed',
    'Ticket closed',
    'Ticket {{ticketNumber}} was closed.',
    'Open ticket',
    slate,
  ),
  'ticket.approval': content(
    'Awaiting your approval: {{ticketTitle}}',
    'A ticket awaits your approval',
    'Your approval is needed',
    'Ticket {{ticketNumber}} is waiting for your decision.',
    'Approve or reject',
    amber,
  ),
  'ticket.sla': content(
    'SLA warning: {{ticketTitle}}',
    'SLA warning',
    'The SLA target is at risk',
    'Ticket {{ticketNumber}} is close to or past its SLA target.',
    'Open ticket',
    red,
  ),
  'remote.requested': content(
    'Remote support requested',
    'Remote support requested',
    'Remote support requested',
    'Remote support was requested for ticket {{ticketNumber}}. Start Quick Assist as described in the application.',
    'Open ticket',
  ),
  'ticket.forwarded': content(
    'Ticket forwarded: {{ticketTitle}}',
    'Ticket forwarded',
    'Ticket forwarded',
    'Ticket {{ticketNumber}} was forwarded to the team that will handle it.',
    'Open ticket',
  ),
  'ticket.broadcast': content(
    'Notice: {{ticketTitle}}',
    'Ticket notice',
    'A notice about your ticket',
    'The support team sent a notice about ticket {{ticketNumber}}.',
    'Open ticket',
  ),
  'report.weekly_tickets': content(
    'Weekly review of your tickets ({{ticketCount}}, {{overdueCount}} overdue)',
    'Weekly review of your tickets ({{ticketCount}})',
    'Your open tickets — {{weekLabel}}',
    'Dear {{recipientName}}, these are the open tickets you take part in ({{ticketCount}}). Tickets past their SLA deadline are at the top.',
    'Open my tickets',
  ),
  'report.scheduled': content(
    '{{reportName}} — {{reportPeriod}}',
    '{{reportName}} — {{reportPeriod}}',
    '{{reportName}}',
    'Dear {{recipientName}}, this is the report for {{reportPeriod}} ({{reportScope}}). Figures are compared with the previous period of the same length.',
    'Open in the application',
  ),
  'privacy.retention_weekly': content(
    'Data retention: summary for {{reportPeriod}}',
    'Data retention: summary for {{reportPeriod}}',
    'Weekly summary of retention deletions',
    'Dear {{recipientName}}, during {{reportPeriod}} the retention policy removed the data listed in the table. No content is included; the list of tickets is in the report in the application.',
    'Open reports',
  ),
  'privacy.erasure_completed': content(
    'Anonymization completed: {{reportName}}',
    'Anonymization completed: {{reportName}}',
    'Anonymization completed',
    'Dear {{recipientName}}, the anonymization you requested or approved has completed. The user is now shown as {{reportName}}. Counts per table follow.',
    'Open privacy',
  ),
  'report.schedule_paused': content(
    'Scheduled report paused: {{reportName}}',
    'Scheduled report paused: {{reportName}}',
    'Scheduled report paused',
    'Dear {{recipientName}}, the report "{{reportName}}" has no recipients left because the last one was removed (anonymization of a former employee), so it was paused. Add recipients and enable it again.',
    'Open scheduled reports',
  ),
  'ops.alert': content(
    '[{{reportPeriod}}] {{reportName}}',
    '[{{reportPeriod}}] {{reportName}}',
    '{{reportName}}',
    'Dear {{recipientName}}, {{appName}} monitoring reports: {{reportName}} ({{reportPeriod}}). Details and the recommended first step follow.',
    'Open system health',
  ),
  'notification.digest': content(
    'Notification digest ({{itemCount}})',
    'Notification digest ({{itemCount}})',
    'Your notification digest',
    'Dear {{recipientName}}, these tickets had new activity since your last digest.',
    'Open tickets',
  ),
  'user.temporary_password': content(
    'Temporary password for {{appName}}',
    'Temporary password for {{appName}}',
    'Your account is ready',
    'Dear {{displayName}}, an account was created for you ({{email}}).\n\nTemporary password: {{temporaryPassword}}\n\nYou must change it at first sign-in.',
    'Sign in',
  ),
};

export const defaultEmailTemplates: EmailTemplateRegistry = { bs, en };

/** Registry v2 serialization (stored in the templates registry setting). */
export function serializeEmailTemplateRegistry(
  templates: EmailTemplateRegistry,
): string {
  return JSON.stringify({ version: 2, locales: templates });
}
