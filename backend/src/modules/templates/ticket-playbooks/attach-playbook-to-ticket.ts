import type { PrismaService } from '../../../common/prisma/prisma.service';
import { changeLogActions } from '../../change-log/change-log.constants';
import { ticketSystemEventActions } from '../../tickets/collaboration.constants';
import type { TicketPersistedMessageSink } from '../../tickets/collaboration.types';
import { insertSystemTicketEvent } from '../../tickets/insert-system-ticket-event';
import type { TicketRecord } from '../../tickets/tickets.types';
import { recordTemplatesChange } from '../record-templates-change';
import { templateChangeLogEntityTypes } from '../templates.constants';
import { TemplatesError } from '../templates.error';
import {
  rankApplicablePlaybooks,
  selectAutoAttachPlaybook,
  toStepSnapshots,
  type PlaybookCandidate,
} from './ticket-playbook-snapshot';

/** Active, not deleted playbooks with their scope (small table, one query). */
export async function loadPlaybookCandidates(prisma: PrismaService): Promise<PlaybookCandidate[]> {
  const rows = await prisma.playbook.findMany({
    where: { deletedAt: null, isActive: true },
    select: {
      id: true,
      name: true,
      services: { select: { serviceId: true } },
      categories: { select: { categoryId: true } },
    },
    orderBy: { name: 'asc' },
    take: 1000,
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    serviceIds: row.services.map((entry) => entry.serviceId),
    categoryIds: row.categories.map((entry) => entry.categoryId),
  }));
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
}): Promise<void> {
  await input.prisma.$transaction(async (transaction) => {
    const tx = transaction as PrismaService;
    await tx.$queryRaw`SELECT "id" FROM "Ticket" WHERE "id" = ${input.ticket.id} FOR UPDATE`;
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
        after: { ticketId: input.ticket.id, playbookId: playbook.id, version: playbook.version, steps },
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
  const [candidates, service] = await Promise.all([
    loadPlaybookCandidates(input.prisma),
    input.prisma.service.findUnique({ where: { id: input.ticket.serviceId }, select: { categoryId: true } }),
  ]);
  const choice = selectAutoAttachPlaybook(
    rankApplicablePlaybooks(candidates, {
      serviceId: input.ticket.serviceId,
      categoryId: service?.categoryId ?? null,
    }),
  );
  if (choice === null) return false;
  await attachPlaybookToTicket({
    prisma: input.prisma,
    ticket: input.ticket,
    playbookId: choice.id,
    // The system attached it, not the requester who created the ticket.
    actorUserId: null,
    autoAttached: true,
    messages: input.messages,
  });
  return true;
}
