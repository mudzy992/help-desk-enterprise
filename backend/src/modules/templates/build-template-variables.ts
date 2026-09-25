import type { PrismaService } from '../../common/prisma/prisma.service';
import { emailLayoutLabels } from '../notifications/email/email-layout-labels';
import type { TemplateLocale } from './templates.constants';
import type { TemplateVariableValues } from './template-placeholders';

export type TemplateTicketFacts = {
  readonly id: string;
  readonly ticketNumber: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly serviceId: string;
  readonly assignedGroupId: string | null;
  readonly originUnitId: string;
  readonly requesterId: string;
};

export type TemplateEnvironment = {
  readonly appName: string;
  readonly publicUrl: string | null;
  readonly timeZone: string;
  readonly now?: Date;
};

export function firstName(displayName: string | null | undefined): string | null {
  const name = (displayName ?? '').trim();
  if (name.length === 0) return null;
  // "Prezime, Ime" (directory style) → Ime; otherwise the first word.
  if (name.includes(',')) {
    const after = name.split(',')[1]?.trim() ?? '';
    if (after.length > 0) return after.split(/\s+/)[0];
  }
  return name.split(/\s+/)[0];
}

export function formatTemplateDateTime(
  value: Date,
  locale: TemplateLocale,
  timeZone: string,
  withTime = true,
): string {
  return new Intl.DateTimeFormat(locale === 'bs' ? 'bs-BA' : 'en-GB', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
    timeZone,
  }).format(value);
}

/**
 * T3: every value a template may use, read with the rights the caller
 * already proved (the ticket was loaded through `loadAccessibleTicket`).
 * One round trip per related table, all in parallel.
 */
export async function buildTemplateVariables(input: {
  readonly prisma: PrismaService;
  readonly ticket: TemplateTicketFacts;
  readonly agentUserId: string;
  readonly locale: TemplateLocale;
  readonly environment: TemplateEnvironment;
}): Promise<TemplateVariableValues> {
  const { prisma, ticket, locale, environment } = input;
  const [requester, agent, service, group, unit, sla] = await Promise.all([
    prisma.user.findUnique({ where: { id: ticket.requesterId }, select: { displayName: true } }),
    prisma.user.findUnique({ where: { id: input.agentUserId }, select: { displayName: true } }),
    prisma.service.findUnique({
      where: { id: ticket.serviceId },
      select: { name: true, category: { select: { name: true } } },
    }),
    ticket.assignedGroupId === null
      ? Promise.resolve(null)
      : prisma.group.findUnique({ where: { id: ticket.assignedGroupId }, select: { name: true } }),
    prisma.organizationalUnit.findUnique({ where: { id: ticket.originUnitId }, select: { name: true } }),
    prisma.ticketSlaState.findUnique({
      where: { ticketId: ticket.id },
      select: { resolutionDueAt: true },
    }),
  ]);
  const labels = emailLayoutLabels[locale];
  const now = environment.now ?? new Date();
  return {
    ticketNumber: ticket.ticketNumber,
    ticketTitle: ticket.title,
    ticketUrl:
      environment.publicUrl === null
        ? null
        : `${environment.publicUrl}/tickets/${encodeURIComponent(ticket.id)}`,
    serviceName: service?.name ?? null,
    categoryName: service?.category?.name ?? null,
    groupName: group?.name ?? null,
    statusLabel: labels.statuses[ticket.status] ?? ticket.status,
    priorityLabel: labels.priorities[ticket.priority] ?? ticket.priority,
    requesterName: requester?.displayName ?? null,
    requesterFirstName: firstName(requester?.displayName),
    agentName: agent?.displayName ?? null,
    agentFirstName: firstName(agent?.displayName),
    organizationalUnitName: unit?.name ?? null,
    slaResolutionDue:
      sla?.resolutionDueAt == null
        ? null
        : formatTemplateDateTime(sla.resolutionDueAt, locale, environment.timeZone),
    appName: environment.appName,
    today: formatTemplateDateTime(now, locale, environment.timeZone, false),
  };
}

/** Editor preview without a ticket: recognisable sample values. */
export function sampleTemplateVariables(
  locale: TemplateLocale,
  environment: TemplateEnvironment,
): TemplateVariableValues {
  const now = environment.now ?? new Date();
  const bs = locale === 'bs';
  return {
    ticketNumber: 'HD-2026-000123',
    ticketTitle: bs ? 'Ne radi štampač na 2. spratu' : 'Printer on the 2nd floor is not working',
    ticketUrl: environment.publicUrl === null ? null : `${environment.publicUrl}/tickets/primjer`,
    serviceName: bs ? 'Štampači' : 'Printers',
    categoryName: bs ? 'Hardver' : 'Hardware',
    groupName: bs ? 'Servis desk – Sarajevo' : 'Service desk – Sarajevo',
    statusLabel: emailLayoutLabels[locale].statuses.IN_PROGRESS ?? 'IN_PROGRESS',
    priorityLabel: emailLayoutLabels[locale].priorities.MEDIUM ?? 'MEDIUM',
    requesterName: 'Amra Hodžić',
    requesterFirstName: 'Amra',
    agentName: 'Emir Mehić',
    agentFirstName: 'Emir',
    organizationalUnitName: bs ? 'Sektor IT' : 'IT department',
    slaResolutionDue: formatTemplateDateTime(
      new Date(now.getTime() + 4 * 3_600_000),
      locale,
      environment.timeZone,
    ),
    appName: environment.appName,
    today: formatTemplateDateTime(now, locale, environment.timeZone, false),
  };
}
