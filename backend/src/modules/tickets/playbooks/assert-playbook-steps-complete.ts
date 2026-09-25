import type { TicketStatus } from '../../../generated/prisma/enums';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { PlaybookRequiredStepsMode } from '../../templates/templates.constants';
import {
  computePlaybookProgress,
  parseStepSnapshots,
} from '../../templates/ticket-playbooks/ticket-playbook-snapshot';
import { TicketsError } from '../tickets.error';

/**
 * Package 1.4 (P5): which staff status changes the playbook guard covers —
 * resolving, and closing from anywhere except RESOLVED (the steps were
 * already checked when the ticket was resolved).
 */
export function isPlaybookGuardedTransition(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) return false;
  if (to === 'RESOLVED') return true;
  return to === 'CLOSED' && from !== 'RESOLVED';
}

/**
 * P5 in `block` mode: refuses the change while required steps are open.
 * `off` and `warn` never query (the dialog warns in `warn`). Merge
 * propagation and automatic closing do not call this: no agent acts there.
 */
export async function assertPlaybookStepsComplete(input: {
  readonly prisma: PrismaService;
  readonly mode: PlaybookRequiredStepsMode | undefined;
  readonly tickets: readonly { readonly id: string; readonly ticketNumber?: string; readonly from: TicketStatus }[];
  readonly to: TicketStatus;
}): Promise<void> {
  if (input.mode !== 'block') return;
  const guarded = input.tickets.filter((ticket) => isPlaybookGuardedTransition(ticket.from, input.to));
  if (guarded.length === 0) return;
  const rows = await input.prisma.ticketPlaybook.findMany({
    where: { ticketId: { in: guarded.map((ticket) => ticket.id) }, detachedAt: null },
    select: { ticketId: true, stepsSnapshot: true, steps: { select: { stepKey: true } } },
  });
  const blocked = rows
    .map((row) => ({
      ticketId: row.ticketId,
      openRequired: computePlaybookProgress(
        parseStepSnapshots(row.stepsSnapshot),
        new Set(row.steps.map((step) => step.stepKey)),
      ).openRequired,
    }))
    .filter((entry) => entry.openRequired.length > 0);
  if (blocked.length === 0) return;
  throw new TicketsError('PLAYBOOK_REQUIRED_STEPS_OPEN', 'PLAYBOOK_REQUIRED_STEPS_OPEN', {
    tickets: blocked.map((entry) => ({
      ticketId: entry.ticketId,
      ticketNumber: guarded.find((ticket) => ticket.id === entry.ticketId)?.ticketNumber ?? null,
      steps: entry.openRequired.map((step) => step.title),
    })),
  });
}
