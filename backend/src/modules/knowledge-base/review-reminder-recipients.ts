import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { permissionKeys } from '../authorization/authorization.constants';
import { canUseKnowledgePermission } from './authorize-knowledge-article';
import type { KnowledgeArticleAccessScope } from './can-read-knowledge-article';
import { loadOwnerGroupMemberUserIds } from './load-knowledge-article-scope';

/**
 * W7.85 (`BA-knowledge-base-12`): a reminder is only useful if it reaches somebody who can *act* on it. The old
 * resolver returned the owner id (or every member of the owner group) without asking whether that person still
 * has an active account and the current `knowledge.article.write` permission in the article's OU and service —
 * so deactivated accounts, anonymized identities and people whose role or service scope was revoked kept being
 * reminded about articles they can no longer edit.
 *
 * The owner group's membership is cached for the whole sweep: the candidate loop used to issue one membership
 * query per article, so one group owning fifty due articles cost fifty identical queries.
 */
export type ReminderEligibilityCaches = {
  readonly groupMembers: Map<string, ReadonlySet<string>>;
  readonly contexts: Map<string, AuthorizationContext | null>;
  readonly activeUsers: Map<string, boolean>;
};

export function createReminderEligibilityCaches(): ReminderEligibilityCaches {
  return { groupMembers: new Map(), contexts: new Map(), activeUsers: new Map() };
}

export type ReminderRecipientCandidate = {
  readonly ownerUserId: string | null;
  readonly ownerGroupId: string | null;
};

/**
 * The recipients of a review reminder for one article, in a stable order: the owner when the article has one,
 * otherwise the eligible members of the owner group. Users without an active account, without a resolvable
 * authorization context, or without `knowledge.article.write` in the article's scope are dropped.
 */
export async function resolveReviewReminderRecipients(input: {
  readonly prisma: PrismaService;
  readonly loader: AuthorizationContextLoader;
  readonly article: ReminderRecipientCandidate;
  readonly scope: KnowledgeArticleAccessScope;
  readonly caches: ReminderEligibilityCaches;
}): Promise<readonly string[]> {
  const candidates =
    input.article.ownerUserId !== null
      ? [input.article.ownerUserId]
      : [...(await groupMembers(input.prisma, input.article.ownerGroupId, input.caches))];
  if (candidates.length === 0) {
    return [];
  }
  const eligible: string[] = [];
  for (const userId of [...candidates].sort()) {
    if (!(await isActiveUser(input.prisma, userId, input.caches))) {
      continue;
    }
    const context = await loadContext(input.loader, userId, input.caches);
    if (context === null) {
      continue;
    }
    if (
      context.isSuperAdmin ||
      canUseKnowledgePermission({
        context,
        permissionKey: permissionKeys.knowledgeArticleWrite,
        organizationalUnitId: input.scope.organizationalUnitId,
        organizationalUnitPath: input.scope.organizationalUnitPath,
        serviceId: input.scope.serviceId,
      })
    ) {
      eligible.push(userId);
    }
  }
  return eligible;
}

async function groupMembers(
  prisma: PrismaService,
  ownerGroupId: string | null,
  caches: ReminderEligibilityCaches,
): Promise<ReadonlySet<string>> {
  if (ownerGroupId === null) {
    return new Set();
  }
  const cached = caches.groupMembers.get(ownerGroupId);
  if (cached !== undefined) {
    return cached;
  }
  const members = await loadOwnerGroupMemberUserIds(prisma, ownerGroupId);
  caches.groupMembers.set(ownerGroupId, members);
  return members;
}

async function isActiveUser(
  prisma: PrismaService,
  userId: string,
  caches: ReminderEligibilityCaches,
): Promise<boolean> {
  const cached = caches.activeUsers.get(userId);
  if (cached !== undefined) {
    return cached;
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true },
  });
  const active = user?.isActive === true;
  caches.activeUsers.set(userId, active);
  return active;
}

async function loadContext(
  loader: AuthorizationContextLoader,
  userId: string,
  caches: ReminderEligibilityCaches,
): Promise<AuthorizationContext | null> {
  if (caches.contexts.has(userId)) {
    return caches.contexts.get(userId) ?? null;
  }
  const context = await loader.loadBySubjectId(userId);
  caches.contexts.set(userId, context);
  return context;
}
