import { PrismaService } from '../../../common/prisma/prisma.service';
import { loadActorGroupIds } from '../../../common/cache/scope-catalog-cache';
import type { AuthorizationContext } from '../../authorization/authorization.types';

export type InboxGroupWhere = { not: null } | { in: string[] };

export async function resolveInboxGroupWhere(
  prisma: PrismaService,
  context: AuthorizationContext,
): Promise<InboxGroupWhere | null> {
  if (context.isSuperAdmin) {
    return { not: null };
  }
  const groupIds = [...(await loadActorGroupIds(prisma, context.subjectId))];
  if (groupIds.length === 0) {
    return null;
  }
  return { in: groupIds };
}
