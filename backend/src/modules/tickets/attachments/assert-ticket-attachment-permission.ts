import { permissionKeys } from '../../authorization/authorization.constants';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { decideAuthorizationAccess } from '../../authorization/evaluate-authorization-access';
import { loadOrganizationalUnitPath } from '../../authorization/load-authorization-scope';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { loadAccessibleTicket } from '../load-accessible-ticket';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';

export async function assertTicketAttachmentPermission(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  context: TicketMutationContext,
  permissionKey:
    | typeof permissionKeys.ticketAttachmentsUpload
    | typeof permissionKeys.ticketAttachmentsDownload,
): Promise<TicketRecord> {
  const loaded = await loadAccessibleTicket(
    prisma,
    authorizationContextLoader,
    ticketId,
    context,
  );
  const authContext = await authorizationContextLoader.loadBySubjectId(
    context.actorUserId,
  );
  if (authContext === null) {
    throw new TicketsError('FORBIDDEN');
  }
  const originUnitPath = await loadOrganizationalUnitPath(
    prisma,
    loaded.ticket.originUnitId,
  );
  if (originUnitPath === null) {
    throw new TicketsError('ORIGIN_UNIT_NOT_FOUND');
  }
  const allowed = decideAuthorizationAccess({
    context: authContext,
    requiredRoles: [],
    requiredPermissions: [permissionKey],
    organizationalUnitId: loaded.ticket.originUnitId,
    organizationalUnitPath: originUnitPath,
    serviceId: loaded.ticket.serviceId,
    requireOrganizationalUnitScope: true,
    requireServiceScope: true,
  }).allowed;
  if (!allowed) {
    throw new TicketsError('FORBIDDEN');
  }
  return loaded.ticket;
}
