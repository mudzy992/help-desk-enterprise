import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { KnowledgeBaseError } from '../knowledge-base.error';
import { withKnowledgeCategoryMembershipLock } from './knowledge-category-membership-lock';

/**
 * Paket 2.9 (K1a): portal categories. One level below the root (a child may
 * not have children), archived instead of deleted so old links keep working.
 * Icons come from a fixed list the frontend maps to lucide components.
 */
export const knowledgeCategoryIcons = [
  'book-open',
  'key-round',
  'laptop',
  'monitor',
  'printer',
  'wifi',
  'mail',
  'phone',
  'shield',
  'users',
  'file-text',
  'wrench',
  'database',
  'cloud',
  'settings',
  'help-circle',
] as const;

export type KnowledgeCategoryIcon = (typeof knowledgeCategoryIcons)[number];

export type KnowledgeCategoryRecord = {
  readonly id: string;
  readonly key: string;
  readonly nameBs: string;
  readonly nameEn: string;
  readonly icon: string;
  readonly sortOrder: number;
  readonly parentId: string | null;
  readonly isArchived: boolean;
};

export type SaveKnowledgeCategoryInput = {
  readonly key?: string;
  readonly nameBs?: string;
  readonly nameEn?: string;
  readonly icon?: string;
  readonly sortOrder?: number;
  readonly parentId?: string | null;
};

const keyPattern = /^[a-z0-9][a-z0-9-]{0,63}$/;

const categorySelect = {
  id: true,
  key: true,
  nameBs: true,
  nameEn: true,
  icon: true,
  sortOrder: true,
  parentId: true,
  isArchived: true,
} as const;

export async function listKnowledgeCategories(
  prisma: PrismaService,
  options: { readonly includeArchived: boolean },
): Promise<readonly KnowledgeCategoryRecord[]> {
  return prisma.knowledgeCategory.findMany({
    where: options.includeArchived ? {} : { isArchived: false },
    select: categorySelect,
    orderBy: [{ sortOrder: 'asc' }, { nameBs: 'asc' }, { id: 'asc' }],
  });
}

/**
 * W7.83 (`BA-knowledge-base-09`): every category mutation takes an optional transaction, so the admin audit entry
 * commits with the change it describes instead of after it. `createKnowledgeArticle` already works this way.
 */
export type KnowledgeCategoryWriteOptions = {
  readonly transaction?: Prisma.TransactionClient;
};

function categoryClient(
  prisma: PrismaService,
  options: KnowledgeCategoryWriteOptions,
): PrismaService {
  return (options.transaction ?? prisma) as unknown as PrismaService;
}

export async function createKnowledgeCategory(
  prisma: PrismaService,
  input: SaveKnowledgeCategoryInput,
  options: KnowledgeCategoryWriteOptions = {},
): Promise<KnowledgeCategoryRecord> {
  const client = categoryClient(prisma, options);
  const key = normalizeKey(input.key);
  // W7.84: a new child is content of its parent, so it serialises with that parent's archive guard.
  return withKnowledgeCategoryMembershipLock(options.transaction, [input.parentId], async () => {
    const data = {
      key,
      nameBs: normalizeName(input.nameBs),
      nameEn: normalizeName(input.nameEn),
      icon: normalizeIcon(input.icon),
      sortOrder: normalizeSortOrder(input.sortOrder),
      parentId: await assertParent(client, input.parentId ?? null, null),
    };
    await assertKeyFree(client, key, null);
    return client.knowledgeCategory.create({ data, select: categorySelect });
  });
}

export async function updateKnowledgeCategory(
  prisma: PrismaService,
  id: string,
  input: SaveKnowledgeCategoryInput,
  options: KnowledgeCategoryWriteOptions = {},
): Promise<{ before: KnowledgeCategoryRecord; after: KnowledgeCategoryRecord }> {
  const client = categoryClient(prisma, options);
  const before = await loadCategory(client, id);
  const data: Record<string, unknown> = {};
  if (input.key !== undefined) {
    data.key = normalizeKey(input.key);
    await assertKeyFree(client, data.key as string, id);
  }
  if (input.nameBs !== undefined) data.nameBs = normalizeName(input.nameBs);
  if (input.nameEn !== undefined) data.nameEn = normalizeName(input.nameEn);
  if (input.icon !== undefined) data.icon = normalizeIcon(input.icon);
  if (input.sortOrder !== undefined) data.sortOrder = normalizeSortOrder(input.sortOrder);
  // W7.84: reparenting adds a child to the new parent, so it serialises with that parent's archive guard.
  return withKnowledgeCategoryMembershipLock(options.transaction, [input.parentId], async () => {
    if (input.parentId !== undefined) {
      data.parentId = await assertParent(client, input.parentId, id);
    }
    const after = await client.knowledgeCategory.update({
      where: { id },
      data,
      select: categorySelect,
    });
    return { before, after };
  });
}

/** Archive (or restore). A parent with active children or with active (non-archived)
 * articles cannot be archived — portal readers would otherwise find broken links. */
export async function setKnowledgeCategoryArchived(
  prisma: PrismaService,
  id: string,
  archived: boolean,
  options: KnowledgeCategoryWriteOptions = {},
): Promise<{ before: KnowledgeCategoryRecord; after: KnowledgeCategoryRecord }> {
  const client = categoryClient(prisma, options);
  // W7.84 (BA-knowledge-base-10): the count and the archive used to be two separate decisions. The whole decision
  // — the read, both counts and the write — now runs under the category's membership lock, so a placement that
  // commits first is counted and a placement that arrives later sees an archived category.
  const apply = async () => {
    const before = await loadCategory(client, id);
    if (archived) {
      const [activeChildren, activeArticles] = await Promise.all([
        client.knowledgeCategory.count({
          where: { parentId: id, isArchived: false },
        }),
        client.knowledgeArticle.count({
          where: { categoryId: id, archivedAt: null },
        }),
      ]);
      if (activeChildren > 0) {
        throw new KnowledgeBaseError('CATEGORY_NOT_EMPTY');
      }
      if (activeArticles > 0) {
        // Package 5.2.4 (M14 B7): backend guard — frontend already disables the
        // archive button, but a direct API call should also be rejected so that
        // a category with live articles can never be hidden.
        throw new KnowledgeBaseError('CATEGORY_NOT_EMPTY');
      }
    } else if (before.parentId !== null) {
      const parent = await loadCategory(client, before.parentId);
      if (parent.isArchived) {
        throw new KnowledgeBaseError('INVALID_CATEGORY');
      }
    }
    const after = await client.knowledgeCategory.update({
      where: { id },
      data: { isArchived: archived },
      select: categorySelect,
    });
    return { before, after };
  };
  return withKnowledgeCategoryMembershipLock(options.transaction, [id], async () => {
    // Restoring a child under a parent that is being archived is the same race in the other direction, so the
    // parent's membership is locked as well. Lock order is always child-then-parent here, and the archive path
    // takes one lock, so the two can never form a cycle.
    const current = await loadCategory(client, id);
    return !archived && current.parentId !== null
      ? withKnowledgeCategoryMembershipLock(options.transaction, [current.parentId], apply)
      : apply();
  });
}

/** For article placement: the category must exist and be active. */
export async function assertKnowledgeCategoryAssignable(
  prisma: PrismaService,
  categoryId: string | null | undefined,
): Promise<string | null> {
  const id = categoryId?.trim() ?? '';
  if (id.length === 0) {
    return null;
  }
  const category = await prisma.knowledgeCategory.findUnique({
    where: { id },
    select: { id: true, isArchived: true },
  });
  if (category === null) {
    throw new KnowledgeBaseError('CATEGORY_NOT_FOUND');
  }
  if (category.isArchived) {
    throw new KnowledgeBaseError('INVALID_CATEGORY');
  }
  return category.id;
}

async function loadCategory(
  prisma: PrismaService,
  id: string,
): Promise<KnowledgeCategoryRecord> {
  const category = await prisma.knowledgeCategory.findUnique({
    where: { id },
    select: categorySelect,
  });
  if (category === null) {
    throw new KnowledgeBaseError('CATEGORY_NOT_FOUND');
  }
  return category;
}

async function assertParent(
  prisma: PrismaService,
  parentId: string | null,
  selfId: string | null,
): Promise<string | null> {
  const id = parentId?.trim() ?? '';
  if (id.length === 0) {
    return null;
  }
  if (id === selfId) {
    throw new KnowledgeBaseError('INVALID_CATEGORY');
  }
  const parent = await loadCategory(prisma, id);
  // One level only: the parent must be a root and active.
  if (parent.parentId !== null || parent.isArchived) {
    throw new KnowledgeBaseError('INVALID_CATEGORY');
  }
  if (selfId !== null) {
    const ownChildren = await prisma.knowledgeCategory.count({
      where: { parentId: selfId },
    });
    if (ownChildren > 0) {
      throw new KnowledgeBaseError('INVALID_CATEGORY');
    }
  }
  return parent.id;
}

async function assertKeyFree(
  prisma: PrismaService,
  key: string,
  selfId: string | null,
): Promise<void> {
  const existing = await prisma.knowledgeCategory.findUnique({
    where: { key },
    select: { id: true },
  });
  if (existing !== null && existing.id !== selfId) {
    throw new KnowledgeBaseError('CATEGORY_KEY_TAKEN');
  }
}

export function normalizeKey(value: string | undefined): string {
  const key = (value ?? '').trim().toLowerCase();
  if (!keyPattern.test(key)) {
    throw new KnowledgeBaseError('INVALID_CATEGORY');
  }
  return key;
}

function normalizeName(value: string | undefined): string {
  const name = (value ?? '').trim().replace(/\s+/g, ' ');
  if (name.length === 0 || name.length > 80) {
    throw new KnowledgeBaseError('INVALID_CATEGORY');
  }
  return name;
}

function normalizeIcon(value: string | undefined): string {
  const icon = (value ?? 'book-open').trim();
  if (!(knowledgeCategoryIcons as readonly string[]).includes(icon)) {
    throw new KnowledgeBaseError('INVALID_CATEGORY');
  }
  return icon;
}

function normalizeSortOrder(value: number | undefined): number {
  const order = value ?? 0;
  if (!Number.isInteger(order) || order < 0 || order > 9999) {
    throw new KnowledgeBaseError('INVALID_CATEGORY');
  }
  return order;
}
