import type { PrismaService } from '../../../common/prisma/prisma.service';
import { assertCategoryParentIsValid } from '../../service-catalog/assert-category-parent-is-valid';
import { assertServiceCategorySlugIsAvailable } from '../../service-catalog/assert-slug-is-available';
import { normalizeServiceName } from '../../service-catalog/normalize-service-name';
import {
  recordServiceCatalogChange,
  serviceCategoryChangeLogEntityType,
} from '../../service-catalog/record-service-catalog-change';
import type {
  InstallBlueprintCategoryDefinition,
  InstallBlueprintLocale,
} from './install-blueprint.types';

export type EnsuredInstallBlueprintCategory = {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly created: boolean;
};

/**
 * F4.2: categories are matched by slug, so re-applying a blueprint (or applying
 * it over the F2 seed, whose „Opšte“ has slug `opste`) reuses the row that is
 * already there. A category that exists keeps its own name — the same rule the
 * structure step follows for the seeded records.
 */
export async function ensureInstallBlueprintCategory(
  prisma: PrismaService,
  input: {
    readonly definition: InstallBlueprintCategoryDefinition;
    readonly locale: InstallBlueprintLocale;
    readonly sortOrder: number;
    readonly actorUserId: string;
  },
): Promise<EnsuredInstallBlueprintCategory> {
  const existing = await prisma.serviceCategory.findUnique({
    where: { slug: input.definition.slug },
    select: { id: true, name: true },
  });
  if (existing !== null) {
    return {
      id: existing.id,
      key: input.definition.key,
      name: existing.name,
      created: false,
    };
  }
  const name = normalizeServiceName(input.definition.names[input.locale]);
  await assertCategoryParentIsValid(prisma, { parentId: null });
  await assertServiceCategorySlugIsAvailable(prisma, input.definition.slug);
  const created = await prisma.serviceCategory.create({
    data: {
      name,
      slug: input.definition.slug,
      sortOrder: input.sortOrder,
      parentId: null,
    },
  });
  await recordServiceCatalogChange(prisma, {
    entityType: serviceCategoryChangeLogEntityType(),
    entityId: created.id,
    reason: 'create',
    diff: { after: { name, slug: created.slug, parentId: null } },
    actorUserId: input.actorUserId,
  });
  return {
    id: created.id,
    key: input.definition.key,
    name: created.name,
    created: true,
  };
}
