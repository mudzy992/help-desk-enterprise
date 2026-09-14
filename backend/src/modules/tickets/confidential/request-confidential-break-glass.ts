import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { loadOrganizationalUnitPath } from '../../authorization/load-authorization-scope';
import { TicketsError } from '../tickets.error';
import { loadTicketRecord } from '../load-ticket-record';
import { assertTicketWritable } from '../archive/assert-ticket-writable';
import type { TicketMutationContext } from '../tickets.types';
import {
  breakGlassDurationMs,
  maximumBreakGlassReasonLength,
} from './confidential.constants';
import type {
  BreakGlassEventRecord,
  BreakGlassResponse,
  TicketConfidentialConfiguration,
} from './confidential.types';
import { canInvokeBreakGlass } from './load-confidential-access-facts';
import { recordConfidentialAccessAudit } from './record-confidential-access-audit';
import { resolveConfidentialTicketAccess } from './assert-confidential-ticket-access';

export async function requestConfidentialBreakGlass(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  reason: string,
  context: TicketMutationContext,
  configuration: TicketConfidentialConfiguration,
  now = new Date(),
): Promise<BreakGlassResponse> {
  const authContext = await authorizationContextLoader.loadBySubjectId(
    context.actorUserId,
  );
  if (authContext === null) {
    throw new TicketsError('FORBIDDEN');
  }
  if (!configuration.enabled) {
    throw new TicketsError('BREAK_GLASS_NOT_APPLICABLE');
  }
  const ticket = await loadTicketRecord(prisma, ticketId);
  assertTicketWritable(ticket, context);
  if (!ticket.isConfidential) {
    throw new TicketsError('BREAK_GLASS_NOT_APPLICABLE');
  }
  const originUnitPath = await loadOrganizationalUnitPath(
    prisma,
    ticket.originUnitId,
  );
  if (originUnitPath === null) {
    throw new TicketsError('ORIGIN_UNIT_NOT_FOUND');
  }
  if (!configuration.breakGlassEnabled) {
    throw new TicketsError('BREAK_GLASS_DISABLED');
  }
  if (
    !canInvokeBreakGlass({
      context: authContext,
      ticket,
      originUnitPath,
      configuration,
    })
  ) {
    await recordConfidentialAccessAudit(prisma, {
      ticketId: ticket.id,
      organizationalUnitId: ticket.originUnitId,
      actorUserId: context.actorUserId,
      result: 'denied',
      configuration,
      writeSystemEvent: false,
    });
    throw new TicketsError('FORBIDDEN');
  }
  const normalizedReason = reason.trim();
  if (configuration.breakGlassRequiresReason && normalizedReason.length === 0) {
    throw new TicketsError('BREAK_GLASS_REASON_REQUIRED');
  }
  if (normalizedReason.length > maximumBreakGlassReasonLength) {
    throw new TicketsError('INVALID_BREAK_GLASS_REASON');
  }
  const current = await resolveConfidentialTicketAccess(prisma, {
    context: authContext,
    ticket,
    originUnitPath,
    configuration,
    now,
  });
  if (current.allowed && current.via !== 'break_glass') {
    throw new TicketsError('BREAK_GLASS_NOT_APPLICABLE');
  }
  const created = (await prisma.breakGlassEvent.create({
    data: {
      ticketId: ticket.id,
      actorUserId: context.actorUserId,
      reason: normalizedReason,
      expiresAt: new Date(now.getTime() + breakGlassDurationMs),
    },
  })) as BreakGlassEventRecord;
  await recordConfidentialAccessAudit(prisma, {
    ticketId: ticket.id,
    organizationalUnitId: ticket.originUnitId,
    actorUserId: context.actorUserId,
    result: 'break_glass',
    via: 'break_glass',
    reason: normalizedReason,
    configuration,
    writeSystemEvent: true,
  });
  return {
    ticketId: created.ticketId,
    actorUserId: created.actorUserId,
    expiresAt: created.expiresAt?.toISOString() ?? null,
    createdAt: created.createdAt.toISOString(),
  };
}
