import { PrismaService } from '../../common/prisma/prisma.service';
import { loadOrganizationalUnitPath } from '../authorization/load-authorization-scope';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { TicketsError } from './tickets.error';
import { canManageTicketsInScope } from './authorize-ticket-actor';

export async function resolveCreateOriginUnitId(
  prisma: PrismaService,
  input: {
    readonly requestedOriginUnitId?: string;
    readonly actorUserId: string;
  },
): Promise<string> {
  const requested = input.requestedOriginUnitId?.trim() ?? '';
  if (requested.length > 0) {
    return requested;
  }
  const requester = await prisma.user.findUnique({
    where: { id: input.actorUserId },
    select: { organizationalUnitId: true },
  });
  const homeUnitId = requester?.organizationalUnitId?.trim() ?? '';
  if (homeUnitId.length === 0) {
    throw new TicketsError('ORIGIN_UNIT_REQUIRED');
  }
  return homeUnitId;
}

export async function assertCanCreateTicket(input: {
  readonly prisma: PrismaService;
  readonly context: AuthorizationContext;
  readonly originUnitId: string;
  readonly serviceId: string;
  readonly actorHomeUnitId: string | null;
}): Promise<void> {
  if (input.context.isSuperAdmin) {
    return;
  }
  if (input.actorHomeUnitId === input.originUnitId) {
    return;
  }
  const originUnitPath = await loadOrganizationalUnitPath(
    input.prisma,
    input.originUnitId,
  );
  if (originUnitPath === null) {
    throw new TicketsError('ORIGIN_UNIT_NOT_FOUND');
  }
  if (
    canManageTicketsInScope({
      context: input.context,
      originUnitId: input.originUnitId,
      originUnitPath,
      serviceId: input.serviceId,
    })
  ) {
    return;
  }
  throw new TicketsError('FORBIDDEN');
}
