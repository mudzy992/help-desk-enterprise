import { PrismaService } from '../../../common/prisma/prisma.service';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext } from '../tickets.types';
import { normalizeSavedViewColumns, normalizeSavedViewFilters, normalizeSavedViewName, normalizeSavedViewSort } from './normalize-saved-view';
import { clearDefaultSavedViews, requireSavedViewsEnabled } from './saved-view-access';
import type { CreateSavedViewInput, SavedViewRecord, TicketSavedViewsConfiguration } from './saved-views.types';
import { toSavedViewJsonValue } from './to-saved-view-json-value';
import { isSavedViewUniqueError, runSavedViewOwnerTransaction } from './run-saved-view-owner-transaction';

export async function createSavedView(input: {
  readonly prisma: PrismaService;
  readonly body: CreateSavedViewInput;
  readonly context: TicketMutationContext;
  readonly configuration: TicketSavedViewsConfiguration;
}): Promise<SavedViewRecord> {
  await requireSavedViewsEnabled(input.configuration);
  const name = normalizeSavedViewName(input.body.name);
  const isDefault = input.body.isDefault === true && input.configuration.allowDefaultView;
  if (input.body.isDefault === true && !input.configuration.allowDefaultView) throw new TicketsError('INVALID_SAVED_VIEW');
  const sort = normalizeSavedViewSort(input.body.sort);
  try {
    return await runSavedViewOwnerTransaction(input.prisma, input.context.actorUserId, async (transaction) => {
      const count = await transaction.savedView.count({ where: { userId: input.context.actorUserId } });
      if (count >= input.configuration.maxPerUser) throw new TicketsError('SAVED_VIEW_LIMIT');
      if (isDefault) await clearDefaultSavedViews(transaction as PrismaService, input.context.actorUserId);
      return transaction.savedView.create({
        data: {
          userId: input.context.actorUserId,
          name,
          filters: toSavedViewJsonValue(normalizeSavedViewFilters(input.body.filters)),
          columns: toSavedViewJsonValue([...normalizeSavedViewColumns(input.body.columns)]),
          isDefault,
          ...(sort === null ? {} : { sort: toSavedViewJsonValue(sort) }),
        },
      }) as Promise<SavedViewRecord>;
    });
  } catch (error) {
    if (isSavedViewUniqueError(error)) throw new TicketsError('SAVED_VIEW_NAME_TAKEN');
    throw error;
  }
}
