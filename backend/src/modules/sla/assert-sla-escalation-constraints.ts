import { PrismaService } from '../../common/prisma/prisma.service';
import { SlaError } from './sla.error';
import type { SlaEscalationRuleRecord } from './ticket-sla.types';

export type EscalationTargetInput = {
  readonly targetGroupId?: string | null;
  readonly targetRole?: string | null;
  readonly targetUserId?: string | null;
};

export function normalizeEscalationTarget(
  input: EscalationTargetInput,
): {
  readonly targetGroupId: string | null;
  readonly targetRole: string | null;
  readonly targetUserId: string | null;
} {
  const targetGroupId = emptyToNull(input.targetGroupId);
  const targetRole = emptyToNull(input.targetRole);
  const targetUserId = emptyToNull(input.targetUserId);
  const setCount = [targetGroupId, targetRole, targetUserId].filter(
    (value) => value !== null,
  ).length;
  if (setCount !== 1) {
    throw new SlaError('INVALID_ESCALATION_TARGET');
  }
  return { targetGroupId, targetRole, targetUserId };
}

export async function assertEscalationTargetExists(
  prisma: PrismaService,
  target: {
    readonly targetGroupId: string | null;
    readonly targetRole: string | null;
    readonly targetUserId: string | null;
  },
): Promise<void> {
  if (target.targetGroupId !== null) {
    const group = await prisma.group.findUnique({
      where: { id: target.targetGroupId },
      select: { id: true },
    });
    if (group === null) {
      throw new SlaError('INVALID_ESCALATION_TARGET');
    }
    return;
  }
  if (target.targetRole !== null) {
    const role = await prisma.role.findUnique({
      where: { key: target.targetRole },
      select: { id: true },
    });
    if (role === null) {
      throw new SlaError('INVALID_ESCALATION_TARGET');
    }
    return;
  }
  if (target.targetUserId !== null) {
    const user = await prisma.user.findUnique({
      where: { id: target.targetUserId },
      select: { id: true },
    });
    if (user === null) {
      throw new SlaError('INVALID_ESCALATION_TARGET');
    }
  }
}

export async function assertEscalationLevelAllowed(
  prisma: PrismaService,
  input: {
    readonly slaProfileId: string;
    readonly maxEscalationLevels: number;
    readonly excludeRuleId?: string;
  },
): Promise<void> {
  const count = await prisma.slaEscalationRule.count({
    where: {
      slaProfileId: input.slaProfileId,
      ...(input.excludeRuleId === undefined
        ? {}
        : { id: { not: input.excludeRuleId } }),
    },
  });
  if (count >= input.maxEscalationLevels) {
    throw new SlaError('MAX_ESCALATION_LEVELS_EXCEEDED');
  }
}

export async function assertEscalationOffsetOrder(
  prisma: PrismaService,
  input: {
    readonly slaProfileId: string;
    readonly triggerOffsetMinutes: number;
    readonly excludeRuleId?: string;
  },
): Promise<void> {
  const existing = (await prisma.slaEscalationRule.findMany({
    where: { slaProfileId: input.slaProfileId },
    orderBy: { triggerOffsetMinutes: 'asc' },
  })) as SlaEscalationRuleRecord[];
  const others = existing.filter((rule) => rule.id !== input.excludeRuleId);
  if (
    others.some(
      (rule) => rule.triggerOffsetMinutes === input.triggerOffsetMinutes,
    )
  ) {
    throw new SlaError('DUPLICATE_ESCALATION_OFFSET');
  }
  const merged = [
    ...others,
    {
      id: input.excludeRuleId ?? 'new',
      slaProfileId: input.slaProfileId,
      triggerOffsetMinutes: input.triggerOffsetMinutes,
      targetGroupId: null,
      targetRole: null,
      targetUserId: null,
    },
  ].sort(
    (left, right) => left.triggerOffsetMinutes - right.triggerOffsetMinutes,
  );
  for (let index = 1; index < merged.length; index += 1) {
    if (
      merged[index]!.triggerOffsetMinutes <=
      merged[index - 1]!.triggerOffsetMinutes
    ) {
      throw new SlaError('INVALID_ESCALATION_OFFSET');
    }
  }
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
