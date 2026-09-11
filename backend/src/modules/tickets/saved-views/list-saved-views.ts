import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketMutationContext } from '../tickets.types';
import { requireSavedViewsEnabled } from './saved-view-access';
import type {
  SavedViewRecord,
  TicketSavedViewsConfiguration,
} from './saved-views.types';

export async function listSavedViews(input: {
  readonly prisma: PrismaService;
  readonly context: TicketMutationContext;
  readonly configuration: TicketSavedViewsConfiguration;
}): Promise<readonly SavedViewRecord[]> {
  await requireSavedViewsEnabled(input.configuration);
  return input.prisma.savedView.findMany({
    where: { userId: input.context.actorUserId },
    orderBy: { createdAt: 'asc' },
  }) as Promise<SavedViewRecord[]>;
}
