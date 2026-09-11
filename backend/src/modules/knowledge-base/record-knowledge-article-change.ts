import { PrismaService } from '../../common/prisma/prisma.service';
import { buildChangeLogDiff } from '../change-log/build-change-log-diff';
import {
  changeLogActions,
  changeLogEntityTypes,
} from '../change-log/change-log.constants';
import type { ChangeLogAction, ChangeLogPrismaClient } from '../change-log/change-log.types';
import { recordChangeLog } from '../change-log/record-change-log';
import { requireChangeReason } from '../change-log/require-change-reason';
import { KnowledgeBaseError } from './knowledge-base.error';
import type { KnowledgeArticleRecord } from './knowledge-base.types';
import { toKnowledgeArticleSnapshot } from './to-knowledge-article-response';

export async function recordKnowledgeArticleChange(
  prisma: PrismaService,
  input: {
    readonly action: ChangeLogAction;
    readonly reason: string;
    readonly before: KnowledgeArticleRecord | null;
    readonly after: KnowledgeArticleRecord;
    readonly actorUserId: string | null;
  },
): Promise<void> {
  let reason: string;
  try {
    reason = requireChangeReason(input.reason);
  } catch {
    throw new KnowledgeBaseError('REASON_REQUIRED');
  }
  await recordChangeLog(prisma as unknown as ChangeLogPrismaClient, {
    entityType: changeLogEntityTypes.knowledgeArticle,
    entityId: input.after.id,
    reason,
    actorUserId: input.actorUserId,
    diff: buildChangeLogDiff({
      action: input.action,
      resourceType: changeLogEntityTypes.knowledgeArticle,
      resourceId: input.after.id,
      before: input.before === null ? {} : toKnowledgeArticleSnapshot(input.before),
      after: toKnowledgeArticleSnapshot(input.after),
    }),
  });
}

export { changeLogActions };
