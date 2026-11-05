import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';
import { changeLogActions } from '../../change-log/change-log.constants';
import { ticketSystemEventActions } from '../../tickets/collaboration.constants';
import type { TicketPersistedMessageSink } from '../../tickets/collaboration.types';
import { insertSystemTicketEvent } from '../../tickets/insert-system-ticket-event';
import type { TicketRecord } from '../../tickets/tickets.types';
import { recordTemplatesChange } from '../record-templates-change';
import { templateChangeLogEntityTypes } from '../templates.constants';
import { TemplatesError } from '../templates.error';
import {
  afterTemplatesNameCursor,
  decodeTemplatesTierNameCursor,
  encodeTemplatesTierNameCursor,
  templatesCursorKinds,
  templatesFilterKey,
  templatesPageLimit,
  type TemplatesCursorPage,
} from '../templates-pagination';
import { toStepSnapshots } from './ticket-playbook-snapshot';

const autoAttachTerminalStatuses = new Set(['RESOLVED', 'CLOSED', 'ARCHIVED']);

type CandidateTier = 'service' | 'category' | 'other';
type AvailablePlaybookCandidate = {
  readonly id: string;
  readonly name: string;
  readonly match: CandidateTier;
};

/** Ticket-specific candidates are paged in relevance tiers before name/id. */
export async function loadPlaybookCandidates(
  prisma: PrismaService,
  ticket: {
    readonly ticketId: string;
    readonly serviceId: string;
    readonly categoryId: string | null;
  },
  query: { readonly cursor?: string; readonly take?: number } = {},
): Promise<TemplatesCursorPage<AvailablePlaybookCandidate>> {
  const take = templatesPageLimit(query.take);
  const tiers: readonly CandidateTier[] =
    ticket.categoryId === null ? ['service', 'other'] : ['service', 'category', 'other'];
  const filterKey = templatesFilterKey({
    resource: 'ticket-playbook-candidates',
    ...ticket,
  });
  const cursor = decodeTemplatesTierNameCursor(
    query.cursor,
    templatesCursorKinds.ticketPlaybookCandidates,
    filterKey,
    tiers,
  );
  const pageRows: {
    readonly id: string;
    readonly name: string;
    readonly match: CandidateTier;
  }[] = [];
  for (const tier of tiers) {
    const tierIndex = tiers.indexOf(tier);
    const cursorIndex = cursor === null ? -1 : tiers.indexOf(cursor.tier as CandidateTier);
    if (cursor !== null && tierIndex < cursorIndex) continue;
    const where: Prisma.PlaybookWhereInput = {
      deletedAt: null,
      isActive: true,
      ...(tier === 'service'
        ? { services: { some: { serviceId: ticket.serviceId } } }
        : tier === 'category'
          ? {
              services: { none: { serviceId: ticket.serviceId } },
              categories: { some: { categoryId: ticket.categoryId as string } },
            }
          : {
              services: { none: { serviceId: ticket.serviceId } },
              ...(ticket.categoryId === null ? {} : { categories: { none: { categoryId: ticket.categoryId } } }),
            }),
    };
    const afterWhere = cursor !== null && tier === cursor.tier ? afterTemplatesNameCursor(cursor) : null;
    const rows = await prisma.playbook.findMany({
      where: afterWhere === null ? where : { AND: [where, afterWhere] },
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: take + 1 - pageRows.length,
    });
    pageRows.push(...rows.map((row) => ({ ...row, match: tier })));
    if (pageRows.length > take) break;
  }
  const hasMore = pageRows.length > take;
  const items = hasMore ? pageRows.slice(0, take) : pageRows;
  const last = items.at(-1);
  return {
    items,
    take,
    cursor: query.cursor ?? null,
    nextCursor:
      hasMore && last !== undefined
        ? encodeTemplatesTierNameCursor(templatesCursorKinds.ticketPlaybookCandidates, {
            tier: last.match,
            name: last.name,
            id: last.id,
            filterKey,
          })
        : null,
    hasMore,
  };
}

/**
 * Auto-attach must establish uniqueness in the database, not by examining a
 * truncated UI candidate page. A two-step service/category count preserves the
 * specificity rule and sees candidates beyond former 1000-row bounds.
 */
export async function findUniqueAutoAttachPlaybook(
  prisma: PrismaService,
  input: { readonly serviceId: string; readonly categoryId: string | null },
): Promise<{ readonly id: string } | null> {
  const serviceWhere: Prisma.PlaybookWhereInput = {
    deletedAt: null,
    isActive: true,
    services: { some: { serviceId: input.serviceId } },
  };
  const serviceCount = await prisma.playbook.count({ where: serviceWhere });
  if (serviceCount > 1) return null;
  if (serviceCount === 1) {
    return prisma.playbook.findFirst({
      where: serviceWhere,
      select: { id: true },
    });
  }
  if (input.categoryId === null) return null;
  const categoryWhere: Prisma.PlaybookWhereInput = {
    deletedAt: null,
    isActive: true,
    categories: { some: { categoryId: input.categoryId } },
  };
  const categoryCount = await prisma.playbook.count({ where: categoryWhere });
  if (categoryCount !== 1) return null;
  return prisma.playbook.findFirst({
    where: categoryWhere,
    select: { id: true },
  });
}

/**
 * P2/P3: copies the playbook's current steps onto the ticket. The "one active
 * checklist per ticket" rule is checked inside the transaction, after locking
 * the ticket row, so two agents attaching at once cannot both succeed.
 */
export async function attachPlaybookToTicket(input: {
  readonly prisma: PrismaService;
  readonly ticket: Pick<TicketRecord, 'id'>;
  readonly playbookId: string;
  readonly actorUserId: string | null;
  readonly autoAttached: boolean;
  readonly messages: TicketPersistedMessageSink;
}): Promise<boolean> {
  return input.prisma.$transaction(async (transaction) => {
    const tx = transaction as PrismaService;
    const lockedTickets = await tx.$queryRaw<
      Array<{
        readonly id: string;
        readonly status: string;
        readonly mergedIntoTicketId: string | null;
      }>
    >`
      SELECT "id", "status", "mergedIntoTicketId" FROM "Ticket"
      WHERE "id" = ${input.ticket.id}
      FOR UPDATE
    `;
    const lockedTicket = lockedTickets[0];
    if (lockedTicket === undefined) {
      if (input.autoAttached) return false;
      throw new TemplatesError('TICKET_PLAYBOOK_NOT_APPLICABLE');
    }
    if (
      input.autoAttached &&
      (autoAttachTerminalStatuses.has(lockedTicket.status) || lockedTicket.mergedIntoTicketId !== null)
    ) {
      return false;
    }
    const existing = await tx.ticketPlaybook.findFirst({
      where: { ticketId: input.ticket.id, detachedAt: null },
      select: { id: true },
    });
    if (existing !== null) {
      throw new TemplatesError('TICKET_PLAYBOOK_ALREADY_ATTACHED');
    }
    const playbook = await tx.playbook.findFirst({
      where: { id: input.playbookId, deletedAt: null, isActive: true },
      include: { steps: { orderBy: { position: 'asc' } } },
    });
    if (playbook === null) {
      throw new TemplatesError('TICKET_PLAYBOOK_NOT_APPLICABLE');
    }
    const steps = toStepSnapshots(playbook.steps);
    const created = await tx.ticketPlaybook.create({
      data: {
        ticketId: input.ticket.id,
        playbookId: playbook.id,
        playbookVersion: playbook.version,
        playbookName: playbook.name,
        stepsSnapshot: steps as unknown as object,
        attachedById: input.actorUserId,
        autoAttached: input.autoAttached,
      },
    });
    {
      await recordTemplatesChange(tx, {
        entityType: templateChangeLogEntityTypes.ticketPlaybook,
        entityId: created.id,
        action: changeLogActions.create,
        reason: input.autoAttached ? 'playbook_auto_attach' : 'playbook_attach',
        before: null,
        after: {
          ticketId: input.ticket.id,
          playbookId: playbook.id,
          version: playbook.version,
          steps,
        },
        actorUserId: input.actorUserId,
      });
    }
    input.messages.push(
      await insertSystemTicketEvent(tx, {
        ticketId: input.ticket.id,
        action: ticketSystemEventActions.playbookAttached,
        actorUserId: input.actorUserId,
        detail: `${input.autoAttached ? 'auto' : 'manual'}:${playbook.version}:${playbook.name.replace(/[\r\n]+/g, ' ')}`,
      }),
    );
    return true;
  });
}

/**
 * P3 on ticket creation: exactly one matching playbook is attached; nothing
 * happens when none or several match. Returns whether one was attached.
 */
export async function autoAttachPlaybook(input: {
  readonly prisma: PrismaService;
  readonly ticket: Pick<TicketRecord, 'id' | 'serviceId'>;
  readonly messages: TicketPersistedMessageSink;
}): Promise<boolean> {
  const service = await input.prisma.service.findUnique({
    where: { id: input.ticket.serviceId },
    select: { categoryId: true },
  });
  const choice = await findUniqueAutoAttachPlaybook(input.prisma, {
    serviceId: input.ticket.serviceId,
    categoryId: service?.categoryId ?? null,
  });
  if (choice === null) return false;
  return attachPlaybookToTicket({
    prisma: input.prisma,
    ticket: input.ticket,
    playbookId: choice.id,
    // The system attached it, not the requester who created the ticket.
    actorUserId: null,
    autoAttached: true,
    messages: input.messages,
  });
}
