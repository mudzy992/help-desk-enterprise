import { Prisma } from '../../../generated/prisma/client';
import { changeLogEntityTypes } from '../../change-log/change-log.constants';
import { mentionTokens } from './mention-tokens';
import type { ScrubIdentifiers } from './text-scrubber';

/**
 * W7.87 (`BA-knowledge-base-14`): *which* knowledge-base rows can carry a
 * person's data, and which replicas have to follow.
 *
 * Until this module existed an anonymisation touched exactly one knowledge
 * table: the person's own feedback comments were nulled. Everything else kept
 * the name — an article they own or are only *named in* (the same gap W7.34
 * closed for problems and W7.74 for changes), the comments other people wrote
 * about them, the in-app notifications that copied the article, the change-log
 * replicas that kept the old title, and the source pointers into their tickets.
 *
 * The selection is the scrubbable text itself, not the relation: every token the
 * scrubber would replace is also a candidate filter, and the database match is a
 * deliberate superset (SQL substring, word boundaries in the scrubber). A row
 * with nothing to replace is skipped, so a wider selection costs nothing but a
 * read.
 */
export const knowledgeScrubbableColumns = ['title', 'body'] as const;

export function knowledgeMentionTokens(identifiers: ScrubIdentifiers): readonly string[] {
  return mentionTokens(identifiers);
}

/** Articles mentioning any token (case-insensitive) in their title or body. */
export function knowledgeArticleMentionWhere(
  tokens: readonly string[],
): Prisma.KnowledgeArticleWhereInput {
  if (tokens.length === 0) return { id: { in: [] } };
  return {
    OR: knowledgeScrubbableColumns.flatMap((column) =>
      tokens.map((token) => ({ [column]: { contains: token, mode: 'insensitive' as const } })),
    ),
  } as Prisma.KnowledgeArticleWhereInput;
}

export type KnowledgeMentionScope = {
  readonly articles: readonly { id: string; title: string; body: string }[];
  readonly feedbacks: readonly { id: string; comment: string | null; userId: string }[];
  readonly notifications: readonly {
    id: string;
    title: string;
    body: string | null;
    payload: unknown;
  }[];
  readonly changeLogs: readonly { id: string; reason: string; diff: unknown }[];
  /** Articles drafted from the person's own tickets (traceability pointers). */
  readonly sourcedArticles: readonly { id: string }[];
};

/**
 * Reads everything the scrub will write, so the preview and the execution see
 * the same rows: the operator's number is the number the run changes.
 */
export async function collectKnowledgeMentions(input: {
  readonly prisma: import('../../../common/prisma/prisma.service').PrismaService;
  readonly userId: string;
  readonly tokens: readonly string[];
  /** Tickets of the person; an article drafted from one keeps a pointer to it. */
  readonly linkedTicketIds: readonly string[];
}): Promise<KnowledgeMentionScope> {
  const { prisma, userId, tokens, linkedTicketIds } = input;

  const articles = await prisma.knowledgeArticle.findMany({
    where: {
      OR: [
        { ownerUserId: userId },
        { reviewerUserId: userId },
        knowledgeArticleMentionWhere(tokens),
      ],
    },
    select: { id: true, title: true, body: true },
  });
  const articleIds = articles.map((article) => article.id);

  // Their own comments are personal free text and go; other people's comments
  // that name them are scrubbed instead of deleted (the rating stays).
  const feedbacks = await prisma.knowledgeFeedback.findMany({
    where: {
      comment: { not: null },
      OR: [
        { userId },
        ...(tokens.length === 0
          ? []
          : tokens.map((token) => ({ comment: { contains: token, mode: 'insensitive' as const } }))),
      ],
    },
    select: { id: true, comment: true, userId: true },
  });

  const notifications =
    articleIds.length === 0
      ? []
      : await prisma.notification.findMany({
          where: {
            OR: articleIds.map((id) => ({ payload: { path: ['articleId'], equals: id } })),
          },
          select: { id: true, title: true, body: true, payload: true },
        });

  const changeLogs =
    articleIds.length === 0
      ? []
      : await prisma.changeLog.findMany({
          where: { entityType: changeLogEntityTypes.knowledgeArticle, entityId: { in: articleIds } },
          select: { id: true, reason: true, diff: true },
        });

  const sourcedArticles =
    linkedTicketIds.length === 0
      ? []
      : await prisma.knowledgeArticle.findMany({
          where: { sourceTicketId: { in: [...linkedTicketIds] } },
          select: { id: true },
        });

  return { articles, feedbacks, notifications, changeLogs, sourcedArticles };
}
