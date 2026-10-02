import { createHash } from 'node:crypto';
import { adaptiveCard, escapeCardText, execute, heading, openUrl, paragraph, type CardElement } from './teams-cards';
import { teamsVerbs } from './teams.constants';
import { teamsHeadline, teamsPriorityLabel, teamsStatusLabel, teamsText, type TeamsLocale, type TeamsTextKey } from './teams-text';

export interface TicketCardFacts {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly serviceName: string;
  readonly assigneeName: string | null;
  readonly dueAt: Date | null;
  readonly isConfidential: boolean;
}

export interface ChangeCardFacts {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly risk: string;
  readonly status: string;
  readonly plannedStart: Date | null;
  readonly plannedEnd: Date | null;
}

export interface NotificationCardInput {
  readonly target: 'personal' | 'channel';
  readonly locale: TeamsLocale;
  readonly timeZone: string;
  readonly notificationType: string;
  /** System event behind the notification (e.g. ticket_approval_requested). */
  readonly event: string;
  /** In-app body (already permission-checked by the producer); never shown in channels. */
  readonly body: string | null;
  readonly ticket: TicketCardFacts | null;
  readonly change: ChangeCardFacts | null;
  /** Problem / other entity: number + link path. */
  readonly other: { readonly entityType: string; readonly id: string; readonly label: string; readonly path: string } | null;
  readonly includeTitle: boolean;
  readonly actionsEnabled: boolean;
  readonly publicUrl: string | null;
}

export interface BuiltNotificationCard {
  readonly entityType: string;
  readonly entityId: string;
  readonly cardKind: string;
  readonly card: Record<string, unknown>;
  readonly stateHash: string;
  readonly summary: string;
}

const snippetLength = 300;
const closedStatuses = new Set(['RESOLVED', 'CLOSED', 'ARCHIVED']);

/**
 * Paket 3.1 (§9): pure card builder. Channels get facts only (no description,
 * no message text; the title only with includeTitle). Buttons appear only when
 * actions are enabled and the entity is still open; the version in the data
 * lets T4 detect stale cards.
 */
export function buildNotificationCard(input: NotificationCardInput): BuiltNotificationCard | null {
  if (input.ticket) return ticketCard(input, input.ticket);
  if (input.change) return changeCard(input, input.change);
  if (input.other) return otherCard(input, input.other);
  return null;
}

function t(locale: TeamsLocale, key: TeamsTextKey): string {
  return teamsText(locale, key);
}

function formatDate(value: Date | null, locale: TeamsLocale, timeZone: string): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'bs-BA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

function facts(entries: readonly (readonly [string, string | null])[]): CardElement {
  return { type: 'FactSet', facts: entries.filter((entry) => entry[1] !== null).map(([title, value]) => ({ title, value: escapeCardText(value ?? '') })) };
}

function link(input: NotificationCardInput, path: string): CardElement[] {
  return input.publicUrl ? [openUrl(t(input.locale, 'open'), `${input.publicUrl}${path}`)] : [];
}

function textForm(locale: TeamsLocale, title: string, verb: string, inputId: string, placeholder: string, data: Record<string, unknown>, required: boolean): CardElement {
  return {
    type: 'Action.ShowCard',
    title,
    card: adaptiveCard(
      [{ type: 'Input.Text', id: inputId, isMultiline: true, maxLength: 4000, placeholder, isRequired: required, ...(required ? { errorMessage: placeholder } : {}) }],
      [execute(t(locale, 'send'), verb, data, { associatedInputs: 'auto' })],
    ),
  };
}

function headlineKey(input: NotificationCardInput): string {
  if (input.notificationType === 'ticket.sla' && input.event.includes('breached')) return 'sla.breached';
  return input.notificationType;
}

function finish(entityType: string, entityId: string, cardKind: string, card: Record<string, unknown>, summary: string): BuiltNotificationCard {
  const stateHash = createHash('sha256').update(JSON.stringify(card)).digest('hex');
  return { entityType, entityId, cardKind, card, stateHash, summary };
}

function ticketCard(input: NotificationCardInput, ticket: TicketCardFacts): BuiltNotificationCard {
  const { locale } = input;
  const open = !closedStatuses.has(ticket.status);
  const headline = teamsHeadline(locale, headlineKey(input));
  // Personal recipients already see the ticket in the app; channels only with includeTitle.
  const showTitle = input.target === 'personal' || (input.includeTitle && !ticket.isConfidential);
  const titleLine = showTitle ? `**${escapeCardText(ticket.number)}** · ${escapeCardText(ticket.title)}` : `**${escapeCardText(ticket.number)}**`;
  const body: CardElement[] = [
    paragraph(headline, { size: 'Small', isSubtle: true, weight: 'Bolder' }),
    heading(titleLine),
    facts([
      [t(locale, 'fieldService'), ticket.serviceName],
      [t(locale, 'fieldPriority'), teamsPriorityLabel(locale, ticket.priority)],
      [t(locale, 'fieldStatus'), teamsStatusLabel(locale, ticket.status)],
      [t(locale, 'fieldAssignee'), ticket.assigneeName ?? t(locale, 'unassigned')],
      [t(locale, 'fieldDue'), formatDate(ticket.dueAt, locale, input.timeZone)],
    ]),
  ];
  const data = { ticketId: ticket.id, version: ticket.status };
  const actions: CardElement[] = [];
  let cardKind: string;
  if (input.target === 'channel') {
    cardKind = 'channel.ticket';
    if (!input.includeTitle) body.push(paragraph(t(locale, 'hiddenTitle'), { size: 'Small', isSubtle: true }));
    if (input.actionsEnabled && open && !ticket.assigneeName) actions.push(execute(t(locale, 'claim'), teamsVerbs.claimTicket, data, { style: 'positive' }));
  } else if (input.notificationType === 'ticket.approval' && input.event === 'ticket_approval_requested') {
    cardKind = 'ticket.approval';
    if (input.actionsEnabled && ticket.status === 'PENDING_APPROVAL') {
      actions.push(execute(t(locale, 'approve'), teamsVerbs.approveTicket, data, { style: 'positive' }));
      actions.push(textForm(locale, t(locale, 'reject'), teamsVerbs.rejectTicket, 'comment', t(locale, 'rejectComment'), data, true));
    }
  } else {
    cardKind = 'ticket';
    if (input.body && !ticket.isConfidential && input.notificationType === 'ticket.message') {
      body.push(paragraph(escapeCardText(input.body.slice(0, snippetLength)), { isSubtle: true }));
    }
    if (input.actionsEnabled && open) {
      if (input.notificationType === 'ticket.sla' && !ticket.assigneeName) actions.push(execute(t(locale, 'claim'), teamsVerbs.claimTicket, data, { style: 'positive' }));
      if (['ticket.assigned', 'ticket.forwarded', 'ticket.message', 'ticket.mentioned'].includes(input.notificationType)) {
        actions.push(textForm(locale, t(locale, 'reply'), teamsVerbs.replyTicket, 'text', t(locale, 'replyPlaceholder'), data, true));
        // Internal notes only make sense for agents; requesters get ticket.message only.
        if (input.notificationType !== 'ticket.message') actions.push(textForm(locale, t(locale, 'note'), teamsVerbs.noteTicket, 'text', t(locale, 'notePlaceholder'), data, true));
      }
    }
  }
  actions.push(...link(input, `/tickets/${encodeURIComponent(ticket.id)}`));
  return finish('ticket', ticket.id, cardKind, adaptiveCard(body, actions), `${headline}: ${ticket.number}`);
}

function changeCard(input: NotificationCardInput, change: ChangeCardFacts): BuiltNotificationCard {
  const { locale } = input;
  const headline = teamsHeadline(locale, input.notificationType);
  const start = formatDate(change.plannedStart, locale, input.timeZone);
  const end = formatDate(change.plannedEnd, locale, input.timeZone);
  const body: CardElement[] = [
    paragraph(headline, { size: 'Small', isSubtle: true, weight: 'Bolder' }),
    heading(`**${escapeCardText(change.number)}** · ${escapeCardText(change.title)}`),
    facts([
      [t(locale, 'fieldRisk'), teamsPriorityLabel(locale, change.risk)],
      [t(locale, 'fieldWindow'), start ? `${start}${end ? ` – ${end}` : ''}` : null],
    ]),
  ];
  const voting = input.notificationType === 'change.approvalRequested';
  const actions: CardElement[] = [];
  const data = { changeId: change.id, version: change.status };
  if (voting && input.actionsEnabled && change.status === 'AUTHORIZATION') {
    actions.push(execute(t(locale, 'approve'), teamsVerbs.approveChange, data, { style: 'positive' }));
    actions.push(textForm(locale, t(locale, 'reject'), teamsVerbs.rejectChange, 'comment', t(locale, 'rejectComment'), data, true));
  }
  actions.push(...link(input, `/changes/${encodeURIComponent(change.id)}`));
  return finish('change', change.id, voting ? 'change.vote' : `change.${input.notificationType}`, adaptiveCard(body, actions), `${headline}: ${change.number}`);
}

function otherCard(input: NotificationCardInput, other: NonNullable<NotificationCardInput['other']>): BuiltNotificationCard {
  const headline = teamsHeadline(input.locale, input.notificationType);
  const body: CardElement[] = [paragraph(headline, { size: 'Small', isSubtle: true, weight: 'Bolder' }), heading(escapeCardText(other.label))];
  if (input.body) body.push(paragraph(escapeCardText(input.body.slice(0, snippetLength)), { isSubtle: true }));
  return finish(other.entityType, other.id, `${other.entityType}.${input.notificationType}`, adaptiveCard(body, link(input, other.path)), headline);
}
