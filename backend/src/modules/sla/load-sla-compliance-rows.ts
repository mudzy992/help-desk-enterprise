import { PrismaService } from '../../common/prisma/prisma.service';
import { isCompletionInWindow } from './aggregate-sla-compliance';
import type {
  SlaComplianceTicketRow,
  SlaComplianceWindow,
  SlaOpenBreachCounts,
} from './sla-compliance.types';

const terminalStatuses = ['RESOLVED', 'CLOSED', 'ARCHIVED'] as const;
const openStatuses = [
  'PENDING',
  'UNROUTED',
  'PENDING_APPROVAL',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_FOR_USER',
] as const;

export type SlaComplianceRows = {
  readonly rows: readonly SlaComplianceTicketRow[];
  readonly openBreached: SlaOpenBreachCounts;
};

export async function loadSlaComplianceProfiles(
  prisma: PrismaService,
): Promise<readonly { readonly id: string; readonly key: string; readonly name: string }[]> {
  return prisma.slaProfile.findMany({
    select: { id: true, key: true, name: true },
    orderBy: { key: 'asc' },
  });
}

export async function loadSlaComplianceRows(
  prisma: PrismaService,
  input: {
    readonly window: SlaComplianceWindow;
    readonly organizationalUnitIds: readonly string[];
  },
): Promise<SlaComplianceRows> {
  const unitIds = [...input.organizationalUnitIds];
  if (unitIds.length === 0) {
    return {
      rows: [],
      openBreached: { response: 0, resolution: 0 },
    };
  }

  const [states, responseBreaches, resolutionBreaches] = await Promise.all([
    prisma.ticketSlaState.findMany({
      where: {
        slaProfileId: { not: null },
        ticket: {
          is: {
            originUnitId: { in: unitIds },
            status: { in: [...terminalStatuses] },
            OR: [
              { closedAt: { gte: input.window.from, lte: input.window.to } },
              {
                closedAt: null,
                resolvedAt: { gte: input.window.from, lte: input.window.to },
              },
            ],
          },
        },
      },
      select: {
        slaProfileId: true,
        isResponseBreached: true,
        isResolutionBreached: true,
        ticket: {
          select: {
            status: true,
            originUnitId: true,
            originUnit: { select: { name: true } },
            serviceId: true,
            service: { select: { name: true } },
            assignedGroupId: true,
            assignedGroup: { select: { name: true } },
            resolvedAt: true,
            closedAt: true,
          },
        },
      },
    }),
    prisma.ticketSlaState.count({
      where: {
        isResponseBreached: true,
        ticket: {
          is: {
            originUnitId: { in: unitIds },
            status: { in: [...openStatuses] },
          },
        },
      },
    }),
    prisma.ticketSlaState.count({
      where: {
        isResolutionBreached: true,
        ticket: {
          is: {
            originUnitId: { in: unitIds },
            status: { in: [...openStatuses] },
          },
        },
      },
    }),
  ]);

  const rows: SlaComplianceTicketRow[] = [];
  for (const state of states) {
    if (state.slaProfileId === null) {
      continue;
    }
    const completionAt = state.ticket.closedAt ?? state.ticket.resolvedAt;
    if (completionAt === null || !isCompletionInWindow(completionAt, input.window)) {
      continue;
    }
    rows.push({
      slaProfileId: state.slaProfileId,
      isResponseBreached: state.isResponseBreached,
      isResolutionBreached: state.isResolutionBreached,
      completionAt,
      status: state.ticket.status,
      originUnitId: state.ticket.originUnitId,
      originUnitName: state.ticket.originUnit.name,
      serviceId: state.ticket.serviceId,
      serviceName: state.ticket.service.name,
      assignedGroupId: state.ticket.assignedGroupId,
      assignedGroupName: state.ticket.assignedGroup?.name ?? null,
    });
  }

  return {
    rows,
    openBreached: {
      response: responseBreaches,
      resolution: resolutionBreaches,
    },
  };
}
