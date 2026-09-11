import { PrismaService } from '../../../common/prisma/prisma.service';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext } from '../tickets.types';
import {
  normalizeSavedViewColumns,
  normalizeSavedViewFilters,
  normalizeSavedViewName,
  normalizeSavedViewSort,
} from './normalize-saved-view';
import {
  clearDefaultSavedViews,
  loadOwnedSavedView,
  requireSavedViewsEnabled,
} from './saved-view-access';
import type {
  SavedViewRecord,
  TicketSavedViewsConfiguration,
  UpdateSavedViewInput,
} from './saved-views.types';
import { toSavedViewJsonValue } from './to-saved-view-json-value';

export async function updateSavedView(input: {
  readonly prisma: PrismaService;
  readonly savedViewId: string;
  readonly body: UpdateSavedViewInput;
  readonly context: TicketMutationContext;
  readonly configuration: TicketSavedViewsConfiguration;
}): Promise<SavedViewRecord> {
  await requireSavedViewsEnabled(input.configuration);
  const current = await loadOwnedSavedView(
    input.prisma,
    input.savedViewId,
    input.context,
  );
  const name =
    input.body.name === undefined
      ? current.name
      : normalizeSavedViewName(input.body.name);
  if (name !== current.name) {
    const duplicate = await input.prisma.savedView.findFirst({
      where: { userId: input.context.actorUserId, name },
      select: { id: true },
    });
    if (duplicate !== null) {
      throw new TicketsError('SAVED_VIEW_NAME_TAKEN');
    }
  }
  let isDefault = current.isDefault;
  if (input.body.isDefault === true) {
    if (!input.configuration.allowDefaultView) {
      throw new TicketsError('INVALID_SAVED_VIEW');
    }
    await clearDefaultSavedViews(
      input.prisma,
      input.context.actorUserId,
      current.id,
    );
    isDefault = true;
  } else if (input.body.isDefault === false) {
    isDefault = false;
  }
  const nextSort =
    input.body.sort === undefined
      ? undefined
      : normalizeSavedViewSort(input.body.sort);
  return input.prisma.savedView.update({
    where: { id: current.id },
    data: {
      name,
      filters:
        input.body.filters === undefined
          ? undefined
          : toSavedViewJsonValue(normalizeSavedViewFilters(input.body.filters)),
      sort:
        nextSort === undefined || nextSort === null
          ? undefined
          : toSavedViewJsonValue(nextSort),
      columns:
        input.body.columns === undefined
          ? undefined
          : toSavedViewJsonValue([...normalizeSavedViewColumns(input.body.columns)]),
      isDefault,
    },
  }) as Promise<SavedViewRecord>;
}
