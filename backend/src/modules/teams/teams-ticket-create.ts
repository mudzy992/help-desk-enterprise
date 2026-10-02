import { adaptiveCard, escapeCardText, execute, heading, openUrl, paragraph, type CardElement } from './teams-cards';
import { teamsVerbs } from './teams.constants';
import { teamsText, type TeamsLocale, type TeamsTextKey } from './teams-text';

export const teamsTicketLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type TeamsTicketLevel = (typeof teamsTicketLevels)[number];
export const teamsServicesDataset = 'services';
export const maxInitialServiceChoices = 15;

export interface TeamsServiceChoice {
  readonly id: string;
  readonly name: string;
}

export interface TeamsTicketDraft {
  readonly serviceId: string;
  readonly title: string;
  readonly description: string;
  readonly impact: TeamsTicketLevel;
  readonly urgency: TeamsTicketLevel;
}

const level = (value: unknown): TeamsTicketLevel => ((teamsTicketLevels as readonly string[]).includes(String(value)) ? (value as TeamsTicketLevel) : 'MEDIUM');

/** Values of the form inputs (Action.Execute data or task module submit). */
export function readTicketDraft(data: Record<string, unknown>): TeamsTicketDraft | null {
  const text = (key: string, max: number) => (typeof data[key] === 'string' ? (data[key] as string).trim().slice(0, max) : '');
  const draft = {
    serviceId: text('serviceId', 64),
    title: text('title', 200),
    description: text('description', 10_000),
    impact: level(data.impact),
    urgency: level(data.urgency),
  };
  return draft.serviceId && draft.title && draft.description ? draft : null;
}

/** Plain text from a Teams message payload (HTML stripped), for "create ticket from message". */
export function messagePayloadText(value: unknown): { text: string; link: string | null } {
  const payload = (value as { messagePayload?: { body?: { content?: unknown }; linkToMessage?: unknown } } | null)?.messagePayload;
  const content = typeof payload?.body?.content === 'string' ? payload.body.content : '';
  const text = content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
    .slice(0, 8_000);
  const link = typeof payload?.linkToMessage === 'string' && payload.linkToMessage.startsWith('https://') ? payload.linkToMessage : null;
  return { text, link };
}

/**
 * Paket 3.1 (§10): the ticket form as an Adaptive Card. The service list is a
 * filtered ChoiceSet with dynamic typeahead (Data.Query → application/search).
 */
export function ticketFormCard(input: {
  locale: TeamsLocale;
  services: readonly TeamsServiceChoice[];
  description?: string;
  publicUrl: string | null;
  /** Task modules (message action) submit with Action.Submit; chat cards use Action.Execute. */
  submitMode?: 'execute' | 'submit';
  /** §20b.2: with the knowledge intercept on the button reads „Dalje“ (suggestions come first). */
  intercept?: boolean;
}): Record<string, unknown> {
  const t = (key: TeamsTextKey) => teamsText(input.locale, key);
  const levels = (id: string, label: string): CardElement => ({
    type: 'Input.ChoiceSet',
    id,
    label,
    value: 'MEDIUM',
    choices: teamsTicketLevels.map((value) => ({ title: t(`level${value}` as TeamsTextKey), value })),
  });
  const body: CardElement[] = [
    heading(t('createTitle')),
    {
      type: 'Input.ChoiceSet',
      id: 'serviceId',
      label: t('createService'),
      placeholder: t('createServicePlaceholder'),
      style: 'filtered',
      isRequired: true,
      errorMessage: t('createService'),
      choices: input.services.slice(0, maxInitialServiceChoices).map((service) => ({ title: service.name, value: service.id })),
      'choices.data': { type: 'Data.Query', dataset: teamsServicesDataset },
    },
    { type: 'Input.Text', id: 'title', label: t('createTicketTitle'), isRequired: true, maxLength: 200, errorMessage: t('createTicketTitle') },
    { type: 'Input.Text', id: 'description', label: t('createDescription'), isRequired: true, isMultiline: true, maxLength: 10_000, value: input.description ?? '', errorMessage: t('createDescription') },
    { type: 'ColumnSet', columns: [{ type: 'Column', width: 'stretch', items: [levels('impact', t('createImpact'))] }, { type: 'Column', width: 'stretch', items: [levels('urgency', t('createUrgency'))] }] },
  ];
  const submit = t(input.intercept ? 'createNext' : 'createSubmit');
  const actions: CardElement[] = [
    input.submitMode === 'submit'
      ? { type: 'Action.Submit', title: submit, style: 'positive', data: { verb: teamsVerbs.createTicket } }
      : execute(submit, teamsVerbs.createTicket, {}, { associatedInputs: 'auto', style: 'positive' }),
  ];
  if (input.publicUrl) actions.push(openUrl(t('openApp'), `${input.publicUrl}/tickets/new`));
  return adaptiveCard(body, actions);
}

export function ticketCreatedCard(locale: TeamsLocale, ticket: { id: string; number: string; title: string }, publicUrl: string | null): Record<string, unknown> {
  return adaptiveCard(
    [paragraph(teamsText(locale, 'doneTicketCreated', { number: escapeCardText(ticket.number) }), { weight: 'Bolder' }), paragraph(escapeCardText(ticket.title))],
    publicUrl ? [openUrl(teamsText(locale, 'open'), `${publicUrl}/tickets/${encodeURIComponent(ticket.id)}`)] : [],
  );
}

export function needsFormCard(locale: TeamsLocale, serviceId: string, publicUrl: string | null): Record<string, unknown> {
  return adaptiveCard(
    [paragraph(teamsText(locale, 'createNeedsForm'))],
    publicUrl ? [openUrl(teamsText(locale, 'openApp'), `${publicUrl}/tickets/new?serviceId=${encodeURIComponent(serviceId)}`)] : [],
  );
}
