import type { PrismaService } from '../../../common/prisma/prisma.service';
import {
  changeEventMentionSql,
  changeMentionTokens,
  changeMentionWhere,
  changeScrubbableColumns,
  downtimeWindowMentionWhere,
} from './change-mentions';
import type { TextScrubber } from './text-scrubber';

export type ChangeMentionCounts = {
  readonly changes: number;
  readonly changeEvents: number;
  readonly changeVotes: number;
  readonly changeNotifications: number;
  readonly downtimeWindows: number;
};

type ChangeTextRow = { readonly id: string } & Record<(typeof changeScrubbableColumns)[number], string | null>;
type VoteRow = { readonly id: string; readonly comment: string | null };
type EventRow = { readonly id: string; readonly detail: unknown };
type NotificationRow = { readonly id: string; readonly title: string; readonly body: string | null; readonly payload: unknown };
type WindowRow = { readonly id: string; readonly message: string };

/**
 * Everything the anonymisation has to read for one person's change footprint.
 * The preview and the execution both start here, so they cannot drift apart:
 * whatever the operator is shown is exactly what will be written.
 */
export type ChangeMentionScope = {
  readonly changes: readonly ChangeTextRow[];
  readonly changeVotes: readonly VoteRow[];
  readonly changeEvents: readonly EventRow[];
  readonly changeNotifications: readonly NotificationRow[];
  readonly downtimeWindows: readonly WindowRow[];
};

const empty: ChangeMentionCounts = {
  changes: 0,
  changeEvents: 0,
  changeVotes: 0,
  changeNotifications: 0,
  downtimeWindows: 0,
};

/**
 * BA-changes-17: five readers of change content, selected in one place.
 *
 * - the change's own columns for every change the person requested, owns, **or
 *   is named in**;
 * - the approval (CAB vote) comments of that person **and** the comments written
 *   on their changes - a vote comment is free text like any other, and the CAB
 *   overview shows it to every board member;
 * - the event details of their changes and of events they triggered, plus events
 *   whose JSON detail names them;
 * - the in-app notifications that copied the change (`payload.changeId`);
 * - the calendar window the change wrote into service-catalog, whose message is
 *   `number · title` - the replica the audit called out explicitly.
 *
 * Already-sent e-mail has no persisted body (`NotificationEmailDelivery` keeps
 * the address, the template key and the dedupe key only), so there is nothing to
 * scrub there; the delivery row itself is removed by the `emailDeliveries`
 * retention category.
 */
export async function collectChangeMentions(input: {
  readonly prisma: PrismaService;
  readonly userId: string;
  readonly tokens: readonly string[];
}): Promise<ChangeMentionScope> {
  const { prisma, userId, tokens } = input;
  const changes = await prisma.changeRequest.findMany({
    where: {
      OR: [{ requesterUserId: userId }, { ownerUserId: userId }, changeMentionWhere(tokens)],
    },
    select: {
      id: true,
      title: true,
      description: true,
      reason: true,
      implementationPlan: true,
      backoutPlan: true,
      testPlan: true,
      communicationPlan: true,
      reviewNotes: true,
      cancelReason: true,
    },
  });

  const changeIds = changes.map((change) => change.id);

  // Vote comments: their own votes, plus the comments on their changes (the CAB
  // board reads every comment of the round).
  const changeVotes = await prisma.changeApproval.findMany({
    where: {
      comment: { not: null },
      OR: [{ approverUserId: userId }, ...(changeIds.length > 0 ? [{ changeId: { in: changeIds } }] : [])],
    },
    select: { id: true, comment: true },
  });

  const eventIds = new Set<string>();
  for (const event of await prisma.changeEvent.findMany({
    where: { actorUserId: userId },
    select: { id: true },
  })) {
    eventIds.add(event.id);
  }
  if (changeIds.length > 0) {
    for (const event of await prisma.changeEvent.findMany({
      where: { changeId: { in: changeIds } },
      select: { id: true },
    })) {
      eventIds.add(event.id);
    }
  }
  // Events that name the person but belong to somebody else's change.
  for (const event of await prisma.$queryRaw<{ id: string }[]>(changeEventMentionSql(tokens))) {
    eventIds.add(event.id);
  }
  const changeEvents =
    eventIds.size === 0
      ? []
      : await prisma.changeEvent.findMany({
          where: { id: { in: [...eventIds] } },
          select: { id: true, detail: true },
        });

  const changeNotifications =
    changeIds.length === 0
      ? []
      : await prisma.notification.findMany({
          where: { OR: changeIds.map((id) => ({ payload: { path: ['changeId'], equals: id } })) },
          select: { id: true, title: true, body: true, payload: true },
        });

  // The service-calendar replica: their changes' windows, plus any window whose
  // message names them.
  const downtimeWindows = await prisma.serviceDowntimeWindow.findMany({
    where: {
      OR: [
        ...(changeIds.length > 0 ? [{ changeRequestId: { in: changeIds } }] : []),
        downtimeWindowMentionWhere(tokens),
      ],
    },
    select: { id: true, message: true },
  });

  return { changes, changeVotes, changeEvents, changeNotifications, downtimeWindows };
}

/** The change part of an anonymisation: select, then rewrite every reader. */
export async function scrubChangeMentions(input: {
  readonly prisma: PrismaService;
  readonly userId: string;
  readonly scrubber: TextScrubber;
}): Promise<ChangeMentionCounts> {
  const { prisma, userId, scrubber } = input;
  const scope = await collectChangeMentions({
    prisma,
    userId,
    tokens: changeMentionTokens(scrubber.identifiers),
  });

  let changedChanges = 0;
  for (const change of scope.changes) {
    const data: Record<string, unknown> = {};
    for (const column of changeScrubbableColumns) {
      const value = change[column];
      if (value === null) continue;
      const result = scrubber.scrub(value);
      if (result.count > 0) data[column] = result.text;
    }
    if (Object.keys(data).length === 0) continue;
    await prisma.changeRequest.update({ where: { id: change.id }, data: data as never });
    changedChanges += 1;
  }

  let changedVotes = 0;
  for (const vote of scope.changeVotes) {
    if (vote.comment === null) continue;
    const result = scrubber.scrub(vote.comment);
    if (result.count === 0) continue;
    await prisma.changeApproval.update({ where: { id: vote.id }, data: { comment: result.text } });
    changedVotes += 1;
  }

  let changedEvents = 0;
  for (const event of scope.changeEvents) {
    const detail = scrubber.scrubJson(event.detail);
    if (detail.count === 0) continue;
    await prisma.changeEvent.update({ where: { id: event.id }, data: { detail: detail.value as never } });
    changedEvents += 1;
  }

  let changedNotifications = 0;
  for (const notification of scope.changeNotifications) {
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

  let changedWindows = 0;
  for (const window of scope.downtimeWindows) {
    const result = scrubber.scrub(window.message);
    if (result.count === 0) continue;
    await prisma.serviceDowntimeWindow.update({
      where: { id: window.id },
      data: { message: result.text },
    });
    changedWindows += 1;
  }

  if (changedChanges + changedVotes + changedEvents + changedNotifications + changedWindows === 0) {
    return empty;
  }
  return {
    changes: changedChanges,
    changeEvents: changedEvents,
    changeVotes: changedVotes,
    changeNotifications: changedNotifications,
    downtimeWindows: changedWindows,
  };
}
