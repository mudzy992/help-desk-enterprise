import { PrismaService } from '../../common/prisma/prisma.service';
import { isPrismaUniqueConstraintError } from './is-prisma-unique-constraint-error';
import { assertCalendarCanBindProfile } from './load-sla-profile';
import {
  normalizeOptionalDescription,
  normalizeSlaKey,
  normalizeSlaName,
} from './normalize-sla-identity';
import { changeLogActions, recordSlaChange } from './record-sla-change';
import { slaChangeLogEntityTypes, slaConstants } from './sla.constants';
import { SlaError } from './sla.error';
import { toProfileSnapshot } from './to-sla-snapshots';
import type {
  ProfileWriteInput,
  SlaMutationContext,
  SlaProfileRecord,
} from './sla.types';

export async function createSlaProfile(
  prisma: PrismaService,
  input: ProfileWriteInput,
  context: SlaMutationContext,
): Promise<SlaProfileRecord> {
  const key = normalizeSlaKey(input.key);
  const name = normalizeSlaName(input.name, slaConstants.maximumNameLength);
  const description = normalizeOptionalDescription(
    input.description,
    slaConstants.maximumDescriptionLength,
  );
  const isActive = input.isActive ?? true;
  await assertCalendarCanBindProfile(prisma, input.calendarId, isActive);
  try {
    return await prisma.$transaction(async (transaction) => {
      const created = await transaction.slaProfile.create({
        data: {
          key,
          name,
          description,
          calendarId: input.calendarId,
          isActive,
        },
      });
      await recordSlaChange(transaction as PrismaService, {
        action: changeLogActions.create,
        entityType: slaChangeLogEntityTypes.profile,
        entityId: created.id,
        reason: input.reason,
        before: {},
        after: toProfileSnapshot(created),
        actorUserId: context.actorUserId,
      });
      return created;
    });
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      throw new SlaError('DUPLICATE_KEY');
    }
    throw error;
  }
}
