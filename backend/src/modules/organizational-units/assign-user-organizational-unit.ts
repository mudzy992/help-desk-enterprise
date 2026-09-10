import { PrismaService } from '../../common/prisma/prisma.service';
import { loadOrganizationalUnit } from './load-organizational-unit';
import { organizationalUnitUserSelect } from './organizational-unit-user-select';
import { OrganizationalUnitError } from './organizational-unit.error';
import type {
  AssignUserOrganizationalUnitInput,
  OrganizationalUnitUserResponse,
} from './organizational-unit.types';
import { toOrganizationalUnitUserResponse } from './to-organizational-unit-user-response';

export async function assignUserOrganizationalUnit(
  prisma: PrismaService,
  input: AssignUserOrganizationalUnitInput,
): Promise<OrganizationalUnitUserResponse> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true },
  });
  if (user === null) {
    throw new OrganizationalUnitError('USER_NOT_FOUND');
  }
  if (input.organizationalUnitId !== null) {
    await loadOrganizationalUnit(prisma, input.organizationalUnitId);
  }
  const updated = await prisma.user.update({
    where: { id: input.userId },
    data: { organizationalUnitId: input.organizationalUnitId },
    select: organizationalUnitUserSelect,
  });
  return toOrganizationalUnitUserResponse(updated);
}
