import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { TextScrubber } from './text-scrubber';
import {
  problemEventMentionSql,
  problemMentionTokens,
  problemMentionWhere,
  problemScrubbableColumns,
} from './problem-mentions';

export type ProblemMentionCounts = {
  readonly problems: number;
  readonly problemEvents: number;
  readonly problemNotifications: number;
  readonly knowledgeArticles: number;
};

const empty: ProblemMentionCounts = {
  problems: 0,
  problemEvents: 0,
  problemNotifications: 0,
  knowledgeArticles: 0,
};

/**
 * W7.34 (BA-problems-16): the problem part of an anonymisation, in one place so
 * the execution and the preview read the same selection.
 *
 * Four readers of problem content are covered:
 *
 * - the problem's own columns (`title`, `description`, root cause, 5-whys,
 *   workaround, resolution, cancellation reason) for every problem the person
 *   created, owns, shares through a linked ticket, **or is named in**;
 * - the event details of those problems and of events the person triggered;
 * - the in-app notifications that copied the problem (they point at it through
 *   `payload.problemId`), because a scrubbed problem with an untouched copy in
 *   somebody's inbox is not an erasure;
 * - the knowledge article a problem produced, draft or published: a published
 *   article is governed content, but the person's name inside it is personal
 *   data and the scrubber only replaces the identifiers, so it can be scrubbed
 *   without destroying the article.
 */
export async function scrubProblemMentions(input: {
  readonly prisma: PrismaService;
  readonly userId: string;
  readonly scrubber: TextScrubber;
  /** Tickets of the person that may be quoted by a problem. */
  readonly linkedTicketIds: readonly string[];
}): Promise<ProblemMentionCounts> {
  const { prisma, userId, scrubber, linkedTicketIds } = input;
  const tokens = problemMentionTokens(scrubber.identifiers);
  const problems = await prisma.problem.findMany({
    where: {
      OR: [
        { createdByUserId: userId },
        { ownerUserId: userId },
        ...(linkedTicketIds.length > 0
          ? [{ tickets: { some: { ticketId: { in: [...linkedTicketIds] } } } }]
          : []),
        problemMentionWhere(tokens),
      ],
    },
    select: {
      id: true,
      title: true,
      description: true,
      rootCause: true,
      rcaWhys: true,
      workaround: true,
      resolution: true,
      cancelReason: true,
      knowledgeArticleId: true,
    },
  });

  let changedProblems = 0;
  const articleIds = new Set<string>();
  for (const problem of problems) {
    const data: Record<string, unknown> = {};
    for (const column of problemScrubbableColumns) {
      const value = problem[column];
      if (value === null) continue;
      const result = scrubber.scrub(value);
      if (result.count > 0) data[column] = result.text;
    }
    const whys = scrubber.scrubJson(problem.rcaWhys);
    if (whys.count > 0) data.rcaWhys = whys.value;
    if (problem.knowledgeArticleId !== null) articleIds.add(problem.knowledgeArticleId);
    if (Object.keys(data).length === 0) continue;
    await prisma.problem.update({ where: { id: problem.id }, data: data as never });
    changedProblems += 1;
  }

  const problemIds = problems.map((problem) => problem.id);
  const eventIds = new Set<string>();
  for (const event of await prisma.problemEvent.findMany({
    where: { actorUserId: userId },
    select: { id: true },
  })) {
    eventIds.add(event.id);
  }
  if (problemIds.length > 0) {
    for (const event of await prisma.problemEvent.findMany({
      where: { problemId: { in: problemIds } },
      select: { id: true },
    })) {
      eventIds.add(event.id);
    }
  }
  // Events that name the person but belong to somebody else's problem: the same
  // tokens, searched inside the JSON detail.
  const mentioned = await prisma.$queryRaw<{ id: string }[]>(problemEventMentionSql(tokens));
  for (const event of mentioned) eventIds.add(event.id);

  let changedEvents = 0;
  if (eventIds.size > 0) {
    const events = await prisma.problemEvent.findMany({
      where: { id: { in: [...eventIds] } },
      select: { id: true, detail: true },
    });
    for (const event of events) {
      const detail = scrubber.scrubJson(event.detail);
      if (detail.count === 0) continue;
      await prisma.problemEvent.update({ where: { id: event.id }, data: { detail: detail.value as never } });
      changedEvents += 1;
    }
  }

  let changedNotifications = 0;
  if (problemIds.length > 0) {
    const notifications = await prisma.notification.findMany({
      where: { OR: problemIds.map((id) => ({ payload: { path: ['problemId'], equals: id } })) },
      select: { id: true, title: true, body: true, payload: true },
    });
    for (const notification of notifications) {
      const title = scrubber.scrub(notification.title);
      const body = notification.body === null ? null : scrubber.scrub(notification.body);
      const payload = scrubber.scrubJson(notification.payload);
      const changed = title.count + (body?.count ?? 0) + payload.count;
      if (changed === 0) continue;
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          title: title.text,
          body: body?.text ?? null,
          ...(payload.count > 0 ? { payload: payload.value as never } : {}),
        },
      });
      changedNotifications += 1;
    }
  }

  let changedArticles = 0;
  if (articleIds.size > 0) {
    const articles = await prisma.knowledgeArticle.findMany({
      where: { id: { in: [...articleIds] } },
      select: { id: true, title: true, body: true },
    });
    for (const article of articles) {
      const title = scrubber.scrub(article.title);
      const body = scrubber.scrub(article.body);
      if (title.count + body.count === 0) continue;
      await prisma.knowledgeArticle.update({
        where: { id: article.id },
        data: { title: title.text, body: body.text },
      });
      changedArticles += 1;
    }
  }

  if (changedProblems + changedEvents + changedNotifications + changedArticles === 0) return empty;
  return {
    problems: changedProblems,
    problemEvents: changedEvents,
    problemNotifications: changedNotifications,
    knowledgeArticles: changedArticles,
  };
}
