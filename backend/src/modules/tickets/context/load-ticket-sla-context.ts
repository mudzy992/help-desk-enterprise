import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { resolveMatchingSlaRule } from '../../sla/resolve-matching-sla-rule';
import type { SlaRuleRecord } from '../../sla/sla.types';
import { loadAccessibleTicket } from '../load-accessible-ticket';
import type { TicketMutationContext } from '../tickets.types';
import type {
  TicketSlaContextResponse,
  TicketSlaUnavailableReason,
} from './context.types';

type ProfileRow = {
  readonly id: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly calendarId: string;
};
type CalendarRow = { readonly name: string; readonly isActive: boolean };

async function loadProfile(
  prisma: PrismaService,
  profileId: string,
): Promise<ProfileRow | null> {
  return (await prisma.slaProfile.findUnique({
    where: { id: profileId },
    select: { id: true, name: true, isActive: true, calendarId: true },
  })) as ProfileRow | null;
}

async function loadCalendar(
  prisma: PrismaService,
  calendarId: string,
): Promise<CalendarRow | null> {
  return (await prisma.businessHoursCalendar.findUnique({
    where: { id: calendarId },
    select: { name: true, isActive: true },
  })) as CalendarRow | null;
}

/**
 * Explains the SLA panel: the profile and calendar behind the timers, or the
 * reason no timers exist for this ticket. Timers are created only when the
 * service has an active SLA profile with a matching rule and an active
 * calendar.
 */
export async function loadTicketSlaContext(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  context: TicketMutationContext,
): Promise<TicketSlaContextResponse> {
  const { ticket } = await loadAccessibleTicket(
    prisma,
    authorizationContextLoader,
    ticketId,
    context,
  );
  const state = (await prisma.ticketSlaState.findUnique({
    where: { ticketId },
    select: { slaProfileId: true },
  })) as { readonly slaProfileId: string | null } | null;
  const service = (await prisma.service.findUnique({
    where: { id: ticket.serviceId },
    select: { slaProfileId: true },
  })) as { readonly slaProfileId: string | null } | null;
  const profileId = state?.slaProfileId ?? service?.slaProfileId ?? null;
  if (profileId === null) {
    return unavailable('NO_PROFILE');
  }
  const profile = await loadProfile(prisma, profileId);
  if (profile === null || !profile.isActive) {
    return unavailable('PROFILE_INACTIVE');
  }
  const calendar = await loadCalendar(prisma, profile.calendarId);
  if (state !== null) {
    return {
      profileName: profile.name,
      calendarName: calendar?.name ?? null,
      unavailableReason: null,
    };
  }
  const rules = (await prisma.slaRule.findMany({
    where: { slaProfileId: profile.id },
  })) as SlaRuleRecord[];
  const rule = resolveMatchingSlaRule(rules, {
    priority: ticket.priority,
    serviceId: ticket.serviceId,
    organizationalUnitId: ticket.originUnitId,
  });
  if (rule === null) {
    return { ...unavailable('NO_RULE'), profileName: profile.name };
  }
  if (calendar === null || !calendar.isActive) {
    return { ...unavailable('NO_CALENDAR'), profileName: profile.name };
  }
  return {
    profileName: profile.name,
    calendarName: calendar.name,
    unavailableReason: 'NOT_APPLIED',
  };
}

function unavailable(
  reason: TicketSlaUnavailableReason,
): TicketSlaContextResponse {
  return { profileName: null, calendarName: null, unavailableReason: reason };
}
