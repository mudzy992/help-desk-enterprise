import type { PrismaService } from '../../common/prisma/prisma.service';
import { startingSlaProfileKeys } from '../sla/starting-sla.constants';

/**
 * Install wizard v2 (F2): the seeded service must be under SLA, otherwise the
 * first ticket has no response/resolution clock. The starting profiles are
 * created on boot (`sla/starting-sla-seed.service.ts`), so the wizard only picks
 * the standard one; if a deployment ships different profiles it falls back to
 * the first active one instead of leaving the service without SLA.
 */
export type InstallSeedSlaProfile = {
  readonly id: string;
  readonly key: string;
};

export const installSeedSlaProfileKey = 'STANDARD_REQUEST' satisfies
  (typeof startingSlaProfileKeys)[number];

export async function resolveInstallSeedSlaProfile(
  prisma: PrismaService,
): Promise<InstallSeedSlaProfile | null> {
  const preferred = await prisma.slaProfile.findFirst({
    where: { key: installSeedSlaProfileKey, isActive: true },
    select: { id: true, key: true },
  });
  if (preferred !== null) {
    return { id: preferred.id, key: preferred.key };
  }
  const anyActive = await prisma.slaProfile.findFirst({
    where: { isActive: true },
    orderBy: { key: 'asc' },
    select: { id: true, key: true },
  });
  return anyActive === null ? null : { id: anyActive.id, key: anyActive.key };
}
