import { PrismaService } from '../../../common/prisma/prisma.service';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext } from '../tickets.types';
import {
  normalizeSavedViewColumns,
  normalizeSavedViewFilters,
  normalizeSavedViewName,
  normalizeSavedViewSort,
} from './normalize-saved-view';
import { clearDefaultSavedViews, requireSavedViewsEnabled } from './saved-view-access';
import type {
  CreateSavedViewInput,
  SavedViewRecord,
  TicketSavedViewsConfiguration,
} from './saved-views.types';
import { toSavedViewJsonValue } from './to-saved-view-json-value';

export async function createSavedView(input: {
  readonly prisma: PrismaService;
  readonly body: CreateSavedViewInput;
  readonly context: TicketMutationContext;
  readonly configuration: TicketSavedViewsConfiguration;
}): Promise<SavedViewRecord> {
  await requireSavedViewsEnabled(input.configuration);
  const name = normalizeSavedViewName(input.body.name);
  const count = await input.prisma.savedView.count({
    where: { userId: input.context.actorUserId },
  });
  if (count >= input.configuration.maxPerUser) {
    throw new TicketsError('SAVED_VIEW_LIMIT');
  }
  const duplicate = await input.prisma.savedView.findFirst({
    where: { userId: input.context.actorUserId, name },
    select: { id: true },
  });
  if (duplicate !== null) {
    throw new TicketsError('SAVED_VIEW_NAME_TAKEN');
  }
  const isDefault =
    input.body.isDefault === true && input.configuration.allowDefaultView;
  if (input.body.isDefault === true && !input.configuration.allowDefaultView) {
    throw new TicketsError('INVALID_SAVED_VIEW');
  }
  if (isDefault) {
    await clearDefaultSavedViews(input.prisma, input.context.actorUserId);
  }
  const sort = normalizeSavedViewSort(input.body.sort);
  return input.prisma.savedView.create({
    data: {
      userId: input.context.actorUserId,
      name,
      filters: toSavedViewJsonValue(normalizeSavedViewFilters(input.body.filters)),
      columns: toSavedViewJsonValue([...normalizeSavedViewColumns(input.body.columns)]),
      isDefault,
      ...(sort === null ? {} : { sort: toSavedViewJsonValue(sort) }),
    },
  }) as Promise<SavedViewRecord>;
}
