import { pickInMemoryFields } from '../routing/in-memory-routing-store';
import {
  createInMemoryGroupMemberDelegate,
  seedInMemoryGroupMember,
  type InMemoryGroupMember,
} from '../tickets/create-in-memory-group-member-delegate';
import type { InMemoryTicketChangeLog } from '../tickets/in-memory-tickets-types';
import { createInMemoryKnowledgeArticleDelegate } from './create-in-memory-knowledge-article-delegate';
import { createInMemoryKnowledgeFeedbackDelegate } from './create-in-memory-knowledge-feedback-delegate';
import type { InMemoryKnowledgeFeedback } from './create-in-memory-knowledge-feedback-delegate';
import type { KnowledgeArticleRecord } from './knowledge-base.types';

export function createInMemoryKnowledgePrisma() {
  const units = new Map<string, { id: string; ouPath: string }>();
  const services = new Map<string, { id: string }>();
  const users = new Map<string, { id: string }>();
  const groups = new Map<string, { id: string }>();
  const members = new Map<string, InMemoryGroupMember>();
  const articles = new Map<string, KnowledgeArticleRecord>();
  const feedbacks = new Map();
  const interceptResolutions = new Map<
    string,
    {
      id: string;
      userId: string;
      serviceId: string;
      organizationalUnitId: string;
      primaryArticleId: string | null;
      createdAt: Date;
    }
  >();
  const changeLogs: InMemoryTicketChangeLog[] = [];
  let nextIdentifier = 1;
  const now = () => new Date('2026-09-11T12:00:00.000Z');
  const nextId = () => `kb-record-${nextIdentifier++}`;

  const prisma = {
    organizationalUnit: {
      findUnique: async ({
        where,
        select,
      }: {
        where: { id: string };
        select?: Record<string, boolean>;
      }) => pickInMemoryFields(units.get(where.id), select),
    },
    service: {
      findUnique: async ({
        where,
        select,
      }: {
        where: { id: string };
        select?: Record<string, boolean>;
      }) => pickInMemoryFields(services.get(where.id), select),
    },
    user: {
      findUnique: async ({
        where,
        select,
      }: {
        where: { id: string };
        select?: Record<string, boolean>;
      }) => pickInMemoryFields(users.get(where.id), select),
    },
    group: {
      findUnique: async ({
        where,
        select,
      }: {
        where: { id: string };
        select?: Record<string, boolean>;
      }) => pickInMemoryFields(groups.get(where.id), select),
    },
    groupMember: createInMemoryGroupMemberDelegate(members),
    knowledgeArticle: createInMemoryKnowledgeArticleDelegate(
      articles,
      nextId,
      now,
    ),
    knowledgeFeedback: createInMemoryKnowledgeFeedbackDelegate(
      feedbacks,
      nextId,
      now,
    ),
    knowledgeInterceptResolution: {
      create: async ({
        data,
        select,
      }: {
        data: {
          userId: string;
          serviceId: string;
          organizationalUnitId: string;
          primaryArticleId: string | null;
        };
        select?: { id?: boolean };
      }) => {
        const created = {
          id: nextId(),
          ...data,
          createdAt: now(),
        };
        interceptResolutions.set(created.id, created);
        return select?.id === true ? { id: created.id } : created;
      },
      count: async ({
        where,
      }: {
        where?: {
          createdAt?: { gte?: Date; lte?: Date };
          organizationalUnitId?: { in: readonly string[] };
        };
      } = {}) => {
        return [...interceptResolutions.values()].filter((row) => {
          if (
            where?.organizationalUnitId?.in !== undefined &&
            !where.organizationalUnitId.in.includes(row.organizationalUnitId)
          ) {
            return false;
          }
          if (
            where?.createdAt?.gte !== undefined &&
            row.createdAt < where.createdAt.gte
          ) {
            return false;
          }
          if (
            where?.createdAt?.lte !== undefined &&
            row.createdAt > where.createdAt.lte
          ) {
            return false;
          }
          return true;
        }).length;
      },
    },
    changeLog: {
      create: async ({ data }: { data: InMemoryTicketChangeLog }) => {
        changeLogs.push(data);
        return data;
      },
    },
    $transaction: async (callback: (client: unknown) => Promise<unknown>) =>
      callback(prisma),
  };

  return {
    prisma,
    changeLogs,
    articles,
    feedbacks,
    now,
    seedUnit: (unit: { id: string; ouPath: string }) => units.set(unit.id, unit),
    seedService: (service: { id: string }) => services.set(service.id, service),
    seedUser: (user: { id: string }) => users.set(user.id, user),
    seedGroup: (group: { id: string }) => groups.set(group.id, group),
    seedGroupMember: (input: { groupId: string; userId: string }) =>
      seedInMemoryGroupMember(members, nextId, input),
    seedArticle: (article: KnowledgeArticleRecord) =>
      articles.set(article.id, article),
    seedFeedback: (feedback: Omit<InMemoryKnowledgeFeedback, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
      const timestamp = now();
      const created: InMemoryKnowledgeFeedback = {
        id: feedback.id ?? nextId(),
        articleId: feedback.articleId,
        userId: feedback.userId,
        isHelpful: feedback.isHelpful,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      feedbacks.set(created.id, created);
    },
  };
}
