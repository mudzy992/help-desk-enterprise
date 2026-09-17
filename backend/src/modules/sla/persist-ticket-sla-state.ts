import { PrismaService } from '../../common/prisma/prisma.service';
import type { TicketSlaStateRecord } from './ticket-sla.types';

export async function loadTicketSlaState(
  prisma: PrismaService,
  ticketId: string,
): Promise<TicketSlaStateRecord | null> {
  const record = await prisma.ticketSlaState.findUnique({
    where: { ticketId },
  });
  return record as TicketSlaStateRecord | null;
}

export async function persistTicketSlaState(
  prisma: PrismaService,
  state: Omit<TicketSlaStateRecord, 'id' | 'updatedAt'> & {
    readonly id?: string;
  },
): Promise<TicketSlaStateRecord> {
  const data = {
    slaProfileId: state.slaProfileId,
    slaRuleId: state.slaRuleId,
    responseMinutes: state.responseMinutes,
    resolutionMinutes: state.resolutionMinutes,
    startedAt: state.startedAt,
    responseDueAt: state.responseDueAt,
    resolutionDueAt: state.resolutionDueAt,
    respondedAt: state.respondedAt,
    resolutionCompletedAt: state.resolutionCompletedAt,
    pausedAt: state.pausedAt,
    pausedBusinessMinutes: state.pausedBusinessMinutes,
    isResponseBreached: state.isResponseBreached,
    isResolutionBreached: state.isResolutionBreached,
    isResponseAtRisk: state.isResponseAtRisk,
    isResolutionAtRisk: state.isResolutionAtRisk,
    firedEscalationKeys: [...(state.firedEscalationKeys ?? [])],
  };
  if (state.id !== undefined && state.id.length > 0) {
    return (await prisma.ticketSlaState.update({
      where: { id: state.id },
      data,
    })) as TicketSlaStateRecord;
  }
  return (await prisma.ticketSlaState.create({
    data: { ticketId: state.ticketId, ...data },
  })) as TicketSlaStateRecord;
}

export async function persistTicketFirstResponseAt(
  prisma: PrismaService,
  ticketId: string,
  firstResponseAt: Date,
): Promise<void> {
  await prisma.ticket.update({
    where: { id: ticketId },
    data: { firstResponseAt },
  });
}
