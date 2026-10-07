import type { PrismaService } from '../../common/prisma/prisma.service';
import { readDisabledPolicyPackKeys } from './read-disabled-policy-pack-keys';
import type { SettingsService } from '../settings/settings.service';

export type PersistedPolicyPackRecord = {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly defaultClassification: string;
  readonly requiresApproval: boolean;
  readonly slaProfileId: string | null;
  readonly isDisabled: boolean;
};

export async function listPersistedPolicyPacks(
  prisma: PrismaService,
  settingsService?: SettingsService,
): Promise<readonly PersistedPolicyPackRecord[]> {
  const disabled = new Set(await readDisabledPolicyPackKeys(settingsService));
  const rows = await prisma.policyPack.findMany({
    select: {
      id: true,
      key: true,
      name: true,
      description: true,
      defaultClassification: true,
      requiresApproval: true,
      slaProfileId: true,
    },
    orderBy: { name: 'asc' },
  });
  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    defaultClassification: row.defaultClassification,
    requiresApproval: row.requiresApproval,
    slaProfileId: row.slaProfileId,
    isDisabled: disabled.has(row.key.trim().toUpperCase()),
  }));
}
