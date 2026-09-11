import { PrismaService } from '../../../common/prisma/prisma.service';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext } from '../tickets.types';
import type { SavedViewRecord, TicketSavedViewsConfiguration } from './saved-views.types';

export async function requireSavedViewsEnabled(
  configuration: TicketSavedViewsConfiguration,
): Promise<void> {
  if (!configuration.enabled) {
    throw new TicketsError('SAVED_VIEWS_DISABLED');
  }
}

export async function loadOwnedSavedView(
  prisma: PrismaService,
  savedViewId: string,
  context: TicketMutationContext,
): Promise<SavedViewRecord> {
  const record = (await prisma.savedView.findFirst({
    where: { id: savedViewId, userId: context.actorUserId },
  })) as SavedViewRecord | null;
  if (record === null) {
    throw new TicketsError('SAVED_VIEW_NOT_FOUND');
  }
  return record;
}

export async function clearDefaultSavedViews(
  prisma: PrismaService,
  userId: string,
  exceptId?: string,
): Promise<void> {
  const records = (await prisma.savedView.findMany({
    where: { userId, isDefault: true },
  })) as SavedViewRecord[];
  for (const record of records) {
    if (exceptId !== undefined && record.id === exceptId) {
      continue;
    }
    await prisma.savedView.update({
      where: { id: record.id },
      data: { isDefault: false },
    });
  }
}
