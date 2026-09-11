import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketMutationContext } from '../tickets.types';
import {
  loadOwnedSavedView,
  requireSavedViewsEnabled,
} from './saved-view-access';
import type { TicketSavedViewsConfiguration } from './saved-views.types';

export async function deleteSavedView(input: {
  readonly prisma: PrismaService;
  readonly savedViewId: string;
  readonly context: TicketMutationContext;
  readonly configuration: TicketSavedViewsConfiguration;
}): Promise<void> {
  await requireSavedViewsEnabled(input.configuration);
  const current = await loadOwnedSavedView(
    input.prisma,
    input.savedViewId,
    input.context,
  );
  await input.prisma.savedView.delete({ where: { id: current.id } });
}
