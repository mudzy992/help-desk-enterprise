import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  recordServiceCatalogChange,
} from '../service-catalog/record-service-catalog-change';
import {
  onboardingChangeLogEntityType,
  onboardingChangeLogReasons,
} from './service-onboarding.constants';
import type { OnboardingMutationContext } from './service-onboarding.types';

export async function recordOnboardingChange(
  prisma: PrismaService,
  input: {
    readonly entityId: string;
    readonly reason: string;
    readonly diff: Prisma.InputJsonValue;
    readonly actorUserId: string | null;
  },
): Promise<void> {
  await recordServiceCatalogChange(prisma, {
    entityType: onboardingChangeLogEntityType,
    entityId: input.entityId,
    reason: input.reason,
    diff: input.diff,
    actorUserId: input.actorUserId,
  });
}

export function onboardingActor(
  context: OnboardingMutationContext,
): string | null {
  return context.actorUserId;
}

export const onboardingReasons = onboardingChangeLogReasons;
