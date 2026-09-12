import { PrismaService } from '../../common/prisma/prisma.service';
import { createSlaProfile } from './create-sla-profile';
import { requireBusinessHoursCalendar } from './load-business-hours-calendar';
import { matchesSlaRuleKey } from './normalize-sla-rule-values';
import { changeLogActions, recordSlaChange } from './record-sla-change';
import { slaChangeLogEntityTypes, slaConstants } from './sla.constants';
import { SlaError } from './sla.error';
import {
  startingSlaSeedContext,
  startingSlaSeedReason,
  type StartingSlaProfileDefinition,
} from './starting-sla.constants';
import {
  businessMinutesPerStandardDay,
  toStartingSlaMinutes,
} from './to-starting-sla-minutes';
import { toRuleSnapshot } from './to-sla-snapshots';
import type {
  BusinessHoursCalendarRecord,
  SlaProfileRecord,
  SlaRuleRecord,
} from './sla.types';

export type StartingSlaProfileEnsureResult = {
  readonly key: StartingSlaProfileDefinition['key'];
  readonly id: string;
  readonly created: boolean;
  readonly createdRuleCount: number;
};

export async function ensureStartingSlaProfile(
  prisma: PrismaService,
  definition: StartingSlaProfileDefinition,
  calendar: BusinessHoursCalendarRecord,
): Promise<StartingSlaProfileEnsureResult> {
  const existing = await prisma.slaProfile.findUnique({
    where: { key: definition.key },
  });
  const profile =
    existing ?? (await createStartingSlaProfile(prisma, definition, calendar.id));
  const boundCalendar =
    profile.calendarId === calendar.id
      ? calendar
      : await requireBusinessHoursCalendar(prisma, profile.calendarId);
  const createdRuleCount = await ensureStartingSlaRules(
    prisma,
    profile,
    definition,
    businessMinutesPerStandardDay(boundCalendar.weeklyHours),
  );
  return {
    key: definition.key,
    id: profile.id,
    created: existing === null,
    createdRuleCount,
  };
}

async function createStartingSlaProfile(
  prisma: PrismaService,
  definition: StartingSlaProfileDefinition,
  calendarId: string,
): Promise<SlaProfileRecord> {
  try {
    return await createSlaProfile(
      prisma,
      {
        key: definition.key,
        name: definition.name,
        description: null,
        calendarId,
        isActive: true,
        reason: startingSlaSeedReason,
      },
      startingSlaSeedContext,
    );
  } catch (error) {
    if (!(error instanceof SlaError) || error.code !== 'DUPLICATE_KEY') {
      throw error;
    }
    const raced = await prisma.slaProfile.findUnique({
      where: { key: definition.key },
    });
    if (raced === null) {
      throw error;
    }
    return raced;
  }
}

async function ensureStartingSlaRules(
  prisma: PrismaService,
  profile: SlaProfileRecord,
  definition: StartingSlaProfileDefinition,
  minutesPerBusinessDay: number,
): Promise<number> {
  const existingRules = await prisma.slaRule.findMany({
    where: { slaProfileId: profile.id },
  });
  let createdRuleCount = 0;
  for (const rule of definition.rules) {
    const alreadyPresent = existingRules.some((existing) =>
      matchesSlaRuleKey(existing, {
        priority: rule.priority,
        organizationalUnitId: null,
        serviceId: null,
      }),
    );
    if (alreadyPresent) {
      continue;
    }
    await persistStartingSlaRule(prisma, {
      slaProfileId: profile.id,
      priority: rule.priority,
      responseMinutes: toStartingSlaMinutes(rule.response, minutesPerBusinessDay),
      resolutionMinutes: toStartingSlaMinutes(
        rule.resolution,
        minutesPerBusinessDay,
      ),
      evaluationOrder: slaConstants.defaultEvaluationOrder,
      organizationalUnitId: null,
      serviceId: null,
    });
    createdRuleCount += 1;
  }
  return createdRuleCount;
}

async function persistStartingSlaRule(
  prisma: PrismaService,
  data: Omit<SlaRuleRecord, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    const created = await transaction.slaRule.create({ data });
    await recordSlaChange(transaction as PrismaService, {
      action: changeLogActions.create,
      entityType: slaChangeLogEntityTypes.rule,
      entityId: created.id,
      reason: startingSlaSeedReason,
      before: {},
      after: toRuleSnapshot(created),
      actorUserId: startingSlaSeedContext.actorUserId,
    });
  });
}
