import { PrismaService } from '../../common/prisma/prisma.service';
import { assertCalendarCanBindProfile, requireSlaProfile } from './load-sla-profile';
import {
  normalizeOptionalDescription,
  normalizeSlaName,
} from './normalize-sla-identity';
import { changeLogActions, recordSlaChange } from './record-sla-change';
import { slaChangeLogEntityTypes, slaConstants } from './sla.constants';
import { toProfileSnapshot } from './to-sla-snapshots';
import type {
  SlaMutationContext,
  SlaProfileRecord,
  UpdateProfileInput,
} from './sla.types';

export async function updateSlaProfile(
  prisma: PrismaService,
  profileId: string,
  input: UpdateProfileInput,
  context: SlaMutationContext,
): Promise<SlaProfileRecord> {
  const current = await requireSlaProfile(prisma, profileId);
  const name =
    input.name === undefined
      ? current.name
      : normalizeSlaName(input.name, slaConstants.maximumNameLength);
  const description =
    input.description === undefined
      ? current.description
      : normalizeOptionalDescription(
          input.description,
          slaConstants.maximumDescriptionLength,
        );
  const calendarId = input.calendarId ?? current.calendarId;
  const isActive = input.isActive ?? current.isActive;
  await assertCalendarCanBindProfile(prisma, calendarId, isActive);
  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.slaProfile.update({
      where: { id: profileId },
      data: { name, description, calendarId, isActive },
    });
    await recordSlaChange(transaction as PrismaService, {
      action: changeLogActions.update,
      entityType: slaChangeLogEntityTypes.profile,
      entityId: updated.id,
      reason: input.reason,
      before: toProfileSnapshot(current),
      after: toProfileSnapshot(updated),
      actorUserId: context.actorUserId,
    });
    return updated;
  });
}
