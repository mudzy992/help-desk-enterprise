import { PrismaService } from '../../common/prisma/prisma.service';
import { isCompletionInWindow } from './aggregate-sla-compliance';
import type {
  SlaComplianceProfileMeta,
  SlaComplianceTicketRow,
  SlaComplianceWindow,
} from './sla-compliance.types';

const terminalStatuses = ['RESOLVED', 'CLOSED', 'ARCHIVED'] as const;

export async function loadSlaComplianceProfiles(
  prisma: PrismaService,
): Promise<readonly SlaComplianceProfileMeta[]> {
  return prisma.slaProfile.findMany({
    select: { id: true, key: true, name: true },
    orderBy: { key: 'asc' },
  });
}

export async function loadSlaComplianceTicketRows(
  prisma: PrismaService,
  window: SlaComplianceWindow,
): Promise<readonly SlaComplianceTicketRow[]> {
  const states = await prisma.ticketSlaState.findMany({
    where: {
      slaProfileId: { not: null },
      ticket: { status: { in: [...terminalStatuses] } },
    },
    select: {
      slaProfileId: true,
      isResponseBreached: true,
      isResolutionBreached: true,
      ticket: {
        select: {
          resolvedAt: true,
          closedAt: true,
        },
      },
    },
  });
  const rows: SlaComplianceTicketRow[] = [];
  for (const state of states) {
    if (state.slaProfileId === null) {
      continue;
    }
    const completionAt = state.ticket.closedAt ?? state.ticket.resolvedAt;
    if (completionAt === null || !isCompletionInWindow(completionAt, window)) {
      continue;
    }
    rows.push({
      slaProfileId: state.slaProfileId,
      isResponseBreached: state.isResponseBreached,
      isResolutionBreached: state.isResolutionBreached,
      completionAt,
    });
  }
  return rows;
}
