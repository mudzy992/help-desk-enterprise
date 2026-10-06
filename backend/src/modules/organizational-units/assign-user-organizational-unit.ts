import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import { auditLogActions } from '../audit-log/audit-log.constants';
import { recordUserChange } from '../users/record-user-change';
import { loadOrganizationalUnit } from './load-organizational-unit';
import { organizationalUnitUserSelect } from './organizational-unit-user-select';
import { OrganizationalUnitError } from './organizational-unit.error';
import type {
  AssignUserOrganizationalUnitInput,
  OrganizationalUnitUserResponse,
} from './organizational-unit.types';
import type { OrganizationalUnitAuditContext } from './organizational-unit-delete.types';
import { toOrganizationalUnitUserResponse } from './to-organizational-unit-user-response';

export async function assignUserOrganizationalUnit(
  prisma: PrismaService,
  input: AssignUserOrganizationalUnitInput,
  context: OrganizationalUnitAuditContext = { actorUserId: null, requestId: null },
): Promise<OrganizationalUnitUserResponse> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, organizationalUnitId: true },
  });
  if (user === null) {
    throw new OrganizationalUnitError('USER_NOT_FOUND');
  }
  if (input.organizationalUnitId !== null) {
    await loadOrganizationalUnit(prisma, input.organizationalUnitId);
  }
  const updated = await prisma.$transaction(async (transaction) => {
    const result = await transaction.user.update({
      where: { id: input.userId },
      data: { organizationalUnitId: input.organizationalUnitId },
      select: organizationalUnitUserSelect,
    });
    if (user.organizationalUnitId !== input.organizationalUnitId) {
      await recordUserChange(transaction as unknown as AuditLogWriteClient, {
        action: auditLogActions.userUpdated,
        entityId: input.userId,
        actorUserId: context.actorUserId,
        requestId: context.requestId,
        organizationalUnitId: input.organizationalUnitId,
        metadata: {
          before: { organizationalUnitId: user.organizationalUnitId },
          after: { organizationalUnitId: input.organizationalUnitId },
        },
      });
    }
    return result;
  });
  return toOrganizationalUnitUserResponse(updated);
}
