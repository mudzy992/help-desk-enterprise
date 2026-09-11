import { PrismaService } from '../../common/prisma/prisma.service';
import { requireSlaProfile } from './load-sla-profile';
import { changeLogActions, recordSlaChange } from './record-sla-change';
import { slaChangeLogEntityTypes } from './sla.constants';
import { SlaError } from './sla.error';
import { toProfileSnapshot } from './to-sla-snapshots';
import type { SlaMutationContext } from './sla.types';

export async function deleteSlaProfile(
  prisma: PrismaService,
  profileId: string,
  reason: string,
  context: SlaMutationContext,
): Promise<void> {
  const current = await requireSlaProfile(prisma, profileId);
  const [serviceCount, policyPackCount] = await Promise.all([
    prisma.service.count({ where: { slaProfileId: profileId } }),
    prisma.policyPack.count({ where: { slaProfileId: profileId } }),
  ]);
  if (serviceCount > 0 || policyPackCount > 0) {
    throw new SlaError('PROFILE_IN_USE');
  }
  await prisma.$transaction(async (transaction) => {
    await transaction.slaProfile.delete({ where: { id: profileId } });
    await recordSlaChange(transaction as PrismaService, {
      action: changeLogActions.delete,
      entityType: slaChangeLogEntityTypes.profile,
      entityId: profileId,
      reason,
      before: toProfileSnapshot(current),
      after: {},
      actorUserId: context.actorUserId,
    });
  });
}
