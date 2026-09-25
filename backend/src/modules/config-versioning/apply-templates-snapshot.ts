import type { ResponseTemplateKind } from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';
import type { ConfigSnapshot } from './config-versioning.types';

/**
 * Package 1.4 — restores shared template / playbook headers. Like the catalog
 * scope, rows that no longer exist are skipped (never re-created) and
 * personal templates are never touched.
 */
export async function applyTemplatesSnapshot(
  transaction: Prisma.TransactionClient,
  snapshot: ConfigSnapshot,
): Promise<void> {
  if (snapshot.templates === undefined) {
    return;
  }
  for (const template of snapshot.templates.responseTemplates) {
    await transaction.responseTemplate.updateMany({
      where: { id: template.id, ownerUserId: null },
      data: {
        name: template.name,
        bodyBs: template.bodyBs,
        bodyEn: template.bodyEn,
        kind: template.kind as ResponseTemplateKind,
        tags: [...template.tags],
        isActive: template.isActive,
        deletedAt: template.deletedAt === null ? null : new Date(template.deletedAt),
      },
    });
  }
  for (const playbook of snapshot.templates.playbooks) {
    await transaction.playbook.updateMany({
      where: { id: playbook.id },
      data: {
        name: playbook.name,
        description: playbook.description,
        isActive: playbook.isActive,
        deletedAt: playbook.deletedAt === null ? null : new Date(playbook.deletedAt),
      },
    });
  }
}
