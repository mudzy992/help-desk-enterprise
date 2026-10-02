import { adaptiveCard, escapeCardText, execute, heading, openUrl, paragraph, type CardElement } from './teams-cards';
import { facts, formatDate, textForm } from './teams-notification-cards';
import { teamsVerbs } from './teams.constants';
import { teamsPriorityLabel, teamsStatusLabel, teamsText, type TeamsLocale, type TeamsTextKey } from './teams-text';

/**
 * Paket 3.1 (§20b): pure builders for the command answers (lists, ticket card,
 * knowledge base, status, on-call). Data arrives already filtered by the
 * domain services; these functions only shape it.
 */
export interface QueryCardContext {
  readonly locale: TeamsLocale;
  readonly timeZone: string;
  readonly publicUrl: string | null;
}

export interface TicketListRow {
  readonly id: string;
  readonly ticketNumber: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly isOverdue: boolean;
  readonly isAtRisk: boolean;
  readonly dueAt: string | null;
  readonly assignedUserId?: string | null;
}

export interface TicketCardFacts extends TicketListRow {
  readonly serviceName: string | null;
  readonly groupName: string | null;
  readonly assigneeName: string | null;
  readonly requesterName: string | null;
  readonly isConfidential: boolean;
}

const openStatuses = new Set(['PENDING', 'UNROUTED', 'PENDING_APPROVAL', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER']);

const tx = (context: QueryCardContext, key: TeamsTextKey, params?: Record<string, string | number>) => teamsText(context.locale, key, params);

function url(context: QueryCardContext, path: string): string | null {
  return context.publicUrl ? `${context.publicUrl}${path}` : null;
}

/** „Prikazano X od Y“ + „Otvori sve u aplikaciji“ (only with a public URL). */
function footer(context: QueryCardContext, shown: number, total: number, path: string): { body: CardElement[]; actions: CardElement[] } {
  const body = total > shown ? [paragraph(tx(context, 'shownOf', { shown, total }), { isSubtle: true, size: 'Small' })] : [];
  const target = url(context, path);
  return { body, actions: target ? [openUrl(tx(context, 'openAll'), target)] : [] };
}

function slaLabel(context: QueryCardContext, row: TicketListRow): string | null {
  if (row.isOverdue) return tx(context, 'slaBreached');
  if (row.isAtRisk) return tx(context, 'slaAtRisk');
  return null;
}

export function ticketListCard(
  context: QueryCardContext,
  input: { titleKey: TeamsTextKey; emptyKey: TeamsTextKey; rows: readonly TicketListRow[]; total: number; path: string; claim?: boolean },
): Record<string, unknown> {
  const body: CardElement[] = [heading(tx(context, input.titleKey))];
  if (input.rows.length === 0) body.push(paragraph(tx(context, input.emptyKey)));
  for (const row of input.rows) {
    const target = url(context, `/tickets/${encodeURIComponent(row.id)}`);
    const meta = [teamsStatusLabel(context.locale, row.status), teamsPriorityLabel(context.locale, row.priority)];
    const due = formatDate(row.dueAt ? new Date(row.dueAt) : null, context.locale, context.timeZone);
    if (due) meta.push(`${tx(context, 'fieldDue')}: ${due}`);
    const sla = slaLabel(context, row);
    const items: CardElement[] = [
      paragraph(`**${escapeCardText(row.ticketNumber)}** · ${escapeCardText(row.title)}`),
      paragraph(meta.join(' · '), { isSubtle: true, spacing: 'None', size: 'Small' }),
    ];
    if (sla) items.push(paragraph(sla, { color: row.isOverdue ? 'Attention' : 'Warning', spacing: 'None', size: 'Small', weight: 'Bolder' }));
    if (input.claim && !row.assignedUserId && openStatuses.has(row.status)) {
      items.push({ type: 'ActionSet', actions: [execute(tx(context, 'claim'), teamsVerbs.claimTicket, { ticketId: row.id, cardKind: 'ticket' }, { style: 'positive' })] });
    }
    body.push({ type: 'Container', separator: true, ...(target ? { selectAction: openUrl(tx(context, 'open'), target) } : {}), items });
  }
  const end = footer(context, input.rows.length, input.total, input.path);
  return adaptiveCard([...body, ...end.body], end.actions);
}

export function ticketDetailCard(
  context: QueryCardContext,
  ticket: TicketCardFacts,
  viewer: { isStaff: boolean; actionsEnabled: boolean },
): Record<string, unknown> {
  const open = openStatuses.has(ticket.status);
  const due = formatDate(ticket.dueAt ? new Date(ticket.dueAt) : null, context.locale, context.timeZone);
  const body: CardElement[] = [
    heading(tx(context, 'ticketTitle', { number: escapeCardText(ticket.ticketNumber) })),
    paragraph(escapeCardText(ticket.title), { weight: 'Bolder' }),
    facts([
      [tx(context, 'fieldStatus'), teamsStatusLabel(context.locale, ticket.status)],
      [tx(context, 'fieldPriority'), teamsPriorityLabel(context.locale, ticket.priority)],
      [tx(context, 'fieldService'), ticket.serviceName],
      [tx(context, 'fieldGroup'), ticket.groupName],
      [tx(context, 'fieldAssignee'), ticket.assigneeName ?? tx(context, 'unassigned')],
      [tx(context, 'fieldRequester'), viewer.isStaff ? ticket.requesterName : null],
      [tx(context, 'fieldDue'), open ? due : null],
    ]),
  ];
  const sla = open ? slaLabel(context, ticket) : null;
  if (sla) body.push(paragraph(sla, { color: ticket.isOverdue ? 'Attention' : 'Warning', weight: 'Bolder' }));
  const actions: CardElement[] = [];
  const data = { ticketId: ticket.id, cardKind: 'ticket' };
  if (viewer.actionsEnabled && open) {
    if (viewer.isStaff && !ticket.assignedUserId) actions.push(execute(tx(context, 'claim'), teamsVerbs.claimTicket, data, { style: 'positive' }));
    actions.push(textForm(context.locale, tx(context, 'reply'), teamsVerbs.replyTicket, 'text', tx(context, 'replyPlaceholder'), data, true));
    if (viewer.isStaff) actions.push(textForm(context.locale, tx(context, 'note'), teamsVerbs.noteTicket, 'text', tx(context, 'notePlaceholder'), data, true));
  }
  const target = url(context, `/tickets/${encodeURIComponent(ticket.id)}`);
  if (target) actions.push(openUrl(tx(context, 'open'), target));
  return adaptiveCard(body, actions);
}

export interface ArticleRow {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly preview: string;
  readonly serviceName?: string | null;
}

function articlePath(article: ArticleRow): string {
  return `/knowledge-base/${encodeURIComponent(article.id)}`;
}

function articleItems(context: QueryCardContext, article: ArticleRow): CardElement {
  const target = url(context, articlePath(article));
  const items: CardElement[] = [paragraph(`**${escapeCardText(article.title)}**`)];
  if (article.preview) items.push(paragraph(escapeCardText(article.preview), { isSubtle: true, spacing: 'None', size: 'Small', maxLines: 3 }));
  if (article.serviceName) items.push(paragraph(escapeCardText(article.serviceName), { isSubtle: true, spacing: 'None', size: 'Small' }));
  if (target) items.push({ type: 'ActionSet', actions: [openUrl(tx(context, 'openArticle'), target)] });
  return { type: 'Container', separator: true, items };
}

export function articlesCard(context: QueryCardContext, query: string, rows: readonly ArticleRow[], total: number): Record<string, unknown> {
  const body: CardElement[] = [heading(tx(context, 'searchTitle', { query: escapeCardText(query) }))];
  if (rows.length === 0) body.push(paragraph(tx(context, 'searchEmpty')));
  body.push(...rows.map((row) => articleItems(context, row)));
  const end = footer(context, rows.length, total, `/knowledge-base?q=${encodeURIComponent(query)}`);
  return adaptiveCard([...body, ...end.body], end.actions);
}

/** §20b.2: suggestions before a ticket is created; the draft travels in the action data. */
export function interceptCard(
  context: QueryCardContext,
  input: { articles: readonly ArticleRow[]; draft: Record<string, unknown>; submitMode: 'execute' | 'submit' },
): Record<string, unknown> {
  const action = (title: string, verb: string, data: Record<string, unknown>, style: string): CardElement =>
    input.submitMode === 'submit' ? { type: 'Action.Submit', title, style, data: { ...data, verb } } : execute(title, verb, data, { style });
  const first = input.articles[0]?.id;
  return adaptiveCard(
    [heading(tx(context, 'interceptTitle')), paragraph(tx(context, 'interceptBody')), ...input.articles.map((row) => articleItems(context, row))],
    [
      action(tx(context, 'interceptResolved'), teamsVerbs.deflectTicket, { serviceId: input.draft.serviceId, ...(first ? { articleId: first } : {}) }, 'positive'),
      action(tx(context, 'interceptCreate'), teamsVerbs.createTicket, { ...input.draft, confirmed: true }, 'default'),
    ],
  );
}

export interface StatusIncidentRow {
  readonly title: string;
  readonly impact: string;
  readonly services: readonly string[];
  readonly startedAt: string;
}

export interface StatusPlannedRow {
  readonly serviceName: string;
  readonly startsAt: string;
  readonly endsAt: string;
}

export function statusCard(context: QueryCardContext, active: readonly StatusIncidentRow[], planned: readonly StatusPlannedRow[], totals: { active: number; planned: number }): Record<string, unknown> {
  const when = (iso: string) => formatDate(new Date(iso), context.locale, context.timeZone) ?? '';
  const body: CardElement[] = [heading(tx(context, 'statusTitle')), paragraph(tx(context, 'statusActive'), { weight: 'Bolder' })];
  if (active.length === 0) body.push(paragraph(tx(context, 'statusAllGood'), { color: 'Good' }));
  for (const incident of active) {
    body.push({
      type: 'Container',
      separator: true,
      items: [
        paragraph(`**${escapeCardText(incident.title)}**`, { color: 'Attention' }),
        paragraph([incident.services.map(escapeCardText).join(', '), when(incident.startedAt)].filter(Boolean).join(' · '), { isSubtle: true, spacing: 'None', size: 'Small' }),
      ],
    });
  }
  body.push(paragraph(tx(context, 'statusPlanned'), { weight: 'Bolder', spacing: 'Medium' }));
  if (planned.length === 0) body.push(paragraph(tx(context, 'statusNoPlanned'), { isSubtle: true }));
  for (const window of planned) body.push(paragraph(`• ${escapeCardText(window.serviceName)}: ${when(window.startsAt)} – ${when(window.endsAt)}`, { spacing: 'Small' }));
  const end = footer(context, active.length + planned.length, totals.active + totals.planned, '/status');
  return adaptiveCard([...body, ...end.body], end.actions);
}

export interface OnCallRow {
  readonly groupName: string;
  readonly displayName: string | null;
  readonly endsAt: string | null;
}

export function onCallCard(
  context: QueryCardContext,
  rows: readonly OnCallRow[],
  total: number,
  me: { current: readonly { groupName: string; endsAt: string }[]; next: { groupName: string; startsAt: string; endsAt: string } | null },
): Record<string, unknown> {
  const when = (iso: string) => formatDate(new Date(iso), context.locale, context.timeZone) ?? '';
  const body: CardElement[] = [heading(tx(context, 'onCallTitle'))];
  for (const shift of me.current) body.push(paragraph(tx(context, 'onCallMine', { group: escapeCardText(shift.groupName), time: when(shift.endsAt) }), { weight: 'Bolder', color: 'Accent' }));
  if (me.current.length === 0 && me.next) {
    body.push(paragraph(tx(context, 'onCallNext', { group: escapeCardText(me.next.groupName), from: when(me.next.startsAt), to: when(me.next.endsAt) }), { isSubtle: true }));
  }
  if (rows.length === 0) body.push(paragraph(tx(context, 'onCallEmpty')));
  else {
    body.push(
      facts(
        rows.map((row) => [
          row.groupName,
          row.displayName ? `${row.displayName}${row.endsAt ? ` (${tx(context, 'onCallUntil', { time: when(row.endsAt) })})` : ''}` : tx(context, 'onCallNobody'),
        ]),
      ),
    );
  }
  const end = footer(context, rows.length, total, '/on-call');
  return adaptiveCard([...body, ...end.body], end.actions);
}

/** Heading card in front of a batch of approval / CAB cards. */
export function summaryCard(context: QueryCardContext, titleKey: TeamsTextKey, emptyKey: TeamsTextKey, shown: number, total: number, path: string): Record<string, unknown> {
  const body: CardElement[] = [heading(tx(context, titleKey))];
  if (total === 0) body.push(paragraph(tx(context, emptyKey)));
  const end = footer(context, shown, total, path);
  return adaptiveCard([...body, ...end.body], total === 0 ? [] : end.actions);
}
