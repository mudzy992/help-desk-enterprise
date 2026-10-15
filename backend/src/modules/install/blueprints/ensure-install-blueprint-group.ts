import type { PrismaService } from '../../../common/prisma/prisma.service';
import { normalizeServiceName } from '../../service-catalog/normalize-service-name';
import type {
  InstallBlueprintLocale,
  InstallBlueprintTierGroupDefinition,
} from './install-blueprint.types';

export type EnsuredInstallBlueprintGroup = {
  readonly id: string;
  readonly key: string;
  readonly groupKey: string;
  readonly name: string;
  readonly created: boolean;
};

/**
 * F4.2: the optional L1/L2 groups of a blueprint („Grupe L1/L2 — K“ in overview
 * §4). A group is matched by its stable `key` inside the unit, so re-applying the
 * blueprint never duplicates „Nivo 1 podrška“; the fallback group the seed step
 * created stays the fallback and is never turned into a tier group.
 */
export async function ensureInstallBlueprintGroup(
  prisma: PrismaService,
  input: {
    readonly definition: InstallBlueprintTierGroupDefinition;
    readonly locale: InstallBlueprintLocale;
    readonly organizationalUnitId: string;
    readonly actorUserId: string;
  },
): Promise<EnsuredInstallBlueprintGroup> {
  const existing = await prisma.group.findFirst({
    where: {
      key: input.definition.groupKey,
      organizationalUnitId: input.organizationalUnitId,
    },
    orderBy: { createdAt: 'asc' },
  });
  if (existing !== null) {
    return {
      id: existing.id,
      key: input.definition.key,
      groupKey: existing.key,
      name: existing.name,
      created: false,
    };
  }
  const name = normalizeServiceName(input.definition.names[input.locale]);
  const created = await prisma.group.create({
    data: {
      name,
      key: input.definition.groupKey,
      organizationalUnitId: input.organizationalUnitId,
      isFallback: false,
    },
  });
  return {
    id: created.id,
    key: input.definition.key,
    groupKey: created.key,
    name: created.name,
    created: true,
  };
}
