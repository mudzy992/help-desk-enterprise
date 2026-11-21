import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { loadOrganizationalUnitPath } from '../authorization/load-authorization-scope';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { canManageTicketsInScope } from '../tickets/authorize-ticket-actor';
import {
  assertKnowledgeOrganizationalUnitExists,
  assertKnowledgeServiceExists,
} from './assert-knowledge-references';
import { isKnowledgeArticleVisibleTo } from './load-knowledge-article-scope';
import { loadKnowledgeActorContext } from './load-knowledge-actor-context';
import { toArticleRecord } from './load-knowledge-article';
import { KnowledgeBaseError } from './knowledge-base.error';
import type {
  KnowledgeArticleMutationContext,
  KnowledgeBaseConfiguration,
} from './knowledge-base.types';

export type KnowledgeInterceptResolveInput = {
  readonly serviceId: string;
  readonly organizationalUnitId: string;
  readonly articleId?: string;
};

export type KnowledgeInterceptResolveResponse = {
  readonly id: string;
};

/**
 * W7.80 (`BA-knowledge-base-06`): a deflection is a **claim about the past** — „this article answered me
 * before I opened a ticket” — so it has to be checked like one. The endpoint used to verify only that the
 * service, the unit and (optionally) the article *exist*: a signed-in user could record a resolution for a
 * foreign service/unit, for a draft or archived article, or for an article they cannot read, and every such
 * row still counted in deflection analytics. The optional article also answered with a different error for
 * „missing” and adoption of an id that was never shown to the caller, which confirmed existence.
 *
 * The claim is now verified against exactly the facts the product already holds:
 *
 * - the recorded unit is one where the caller **could have opened the ticket** — their own home unit, or a
 *   unit they manage tickets in for that service (`canManageTicketsInScope`, the same rule
 *   `assertCanCreateTicket` applies). A deflection for someone else's unit is not the caller's to record;
 * - the recorded article is **readable by the caller** (the one visibility predicate, with the installation's
 *   INTERNAL policy), **published** and belongs to the **claimed service** — otherwise the deflection would
 *   credit a service that did not answer and a text the caller never saw;
 * - an unknown article id answers `FORBIDDEN`, exactly like a hidden one, so the endpoint is no longer an
 *   existence oracle;
 * - while the intercept feature is off there are no suggestions to resolve, so nothing is recorded.
 *
 * Failures write nothing: every check runs before the single `create`.
 */
export async function resolveKnowledgeIntercept(
  prisma: PrismaService,
  loader: AuthorizationContextLoader,
  configuration: KnowledgeBaseConfiguration,
  input: KnowledgeInterceptResolveInput,
  context: KnowledgeArticleMutationContext,
): Promise<KnowledgeInterceptResolveResponse> {
  const actor = await loadKnowledgeActorContext(loader, context);
  if (!configuration.interceptEnabled) {
    throw new KnowledgeBaseError('FORBIDDEN');
  }
  const serviceId = await assertKnowledgeServiceExists(prisma, input.serviceId);
  const organizationalUnitId = await assertKnowledgeOrganizationalUnitExists(
    prisma,
    input.organizationalUnitId,
  );
  await assertDeflectionUnitIsClaimable(
    prisma,
    actor,
    organizationalUnitId,
    serviceId,
  );
  const primaryArticleId = await resolveDeflectedArticleId(
    prisma,
    actor,
    configuration,
    serviceId,
    input.articleId,
  );
  const created = await prisma.knowledgeInterceptResolution.create({
    data: {
      userId: context.actorUserId,
      serviceId,
      organizationalUnitId,
      primaryArticleId,
    },
    select: { id: true },
  });
  return { id: created.id };
}

/**
 * „May this caller report a deflection for that unit?” — the authority to have created the missing ticket.
 * A plain user may only speak for their home unit; staff may speak for any unit and service their assignment
 * covers, which is exactly what the ticket form offers them.
 */
async function assertDeflectionUnitIsClaimable(
  prisma: PrismaService,
  actor: AuthorizationContext,
  organizationalUnitId: string,
  serviceId: string,
): Promise<void> {
  if (actor.isSuperAdmin) {
    return;
  }
  const requester = await prisma.user.findUnique({
    where: { id: actor.subjectId },
    select: { organizationalUnitId: true },
  });
  const homeUnitId = requester?.organizationalUnitId?.trim() ?? '';
  if (homeUnitId.length > 0 && homeUnitId === organizationalUnitId) {
    return;
  }
  const organizationalUnitPath = await loadOrganizationalUnitPath(
    prisma,
    organizationalUnitId,
  );
  if (organizationalUnitPath === null) {
    throw new KnowledgeBaseError('ORGANIZATIONAL_UNIT_NOT_FOUND');
  }
  if (
    canManageTicketsInScope({
      context: actor,
      originUnitId: organizationalUnitId,
      originUnitPath: organizationalUnitPath,
      serviceId,
    })
  ) {
    return;
  }
  throw new KnowledgeBaseError('FORBIDDEN');
}

async function resolveDeflectedArticleId(
  prisma: PrismaService,
  actor: AuthorizationContext,
  configuration: KnowledgeBaseConfiguration,
  claimedServiceId: string,
  rawArticleId: string | undefined,
): Promise<string | null> {
  const articleId = rawArticleId?.trim() ?? '';
  if (articleId.length === 0) {
    return null;
  }
  const record = await prisma.knowledgeArticle.findUnique({
    where: { id: articleId },
  });
  // „Unknown”, „foreign” and „hidden” answer the same way on purpose: an id the caller was never shown must
  // not be distinguishable from an id that does not exist.
  if (record === null) {
    throw new KnowledgeBaseError('FORBIDDEN');
  }
  const article = toArticleRecord(record);
  if (
    article.serviceId !== claimedServiceId ||
    article.status !== 'PUBLISHED'
  ) {
    throw new KnowledgeBaseError('FORBIDDEN');
  }
  if (
    !(await isKnowledgeArticleVisibleTo(prisma, actor, article, configuration))
  ) {
    throw new KnowledgeBaseError('FORBIDDEN');
  }
  return article.id;
}
