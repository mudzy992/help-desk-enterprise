import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext } from '../tickets.types';
import { normalizeSavedViewColumns, normalizeSavedViewFilters, normalizeSavedViewName, normalizeSavedViewSort } from './normalize-saved-view';
import { clearDefaultSavedViews, loadOwnedSavedView, requireSavedViewsEnabled } from './saved-view-access';
import type { SavedViewRecord, TicketSavedViewsConfiguration, UpdateSavedViewInput } from './saved-views.types';
import { toSavedViewJsonValue } from './to-saved-view-json-value';
import { isSavedViewUniqueError, runSavedViewOwnerTransaction } from './run-saved-view-owner-transaction';

export async function updateSavedView(input: {
  readonly prisma: PrismaService;
  readonly savedViewId: string;
  readonly body: UpdateSavedViewInput;
  readonly context: TicketMutationContext;
  readonly configuration: TicketSavedViewsConfiguration;
}): Promise<SavedViewRecord> {
  await requireSavedViewsEnabled(input.configuration);
  if (input.body.isDefault === true && !input.configuration.allowDefaultView) throw new TicketsError('INVALID_SAVED_VIEW');
  try {
    return await runSavedViewOwnerTransaction(input.prisma, input.context.actorUserId, async (transaction) => {
      const tx = transaction as PrismaService;
      const current = await loadOwnedSavedView(tx, input.savedViewId, input.context);
      const name = input.body.name === undefined ? current.name : normalizeSavedViewName(input.body.name);
      let isDefault = current.isDefault;
      if (input.body.isDefault === true) {
        await clearDefaultSavedViews(tx, input.context.actorUserId, current.id);
        isDefault = true;
      } else if (input.body.isDefault === false) {
        isDefault = false;
      }
      const nextSort = input.body.sort === undefined ? undefined : normalizeSavedViewSort(input.body.sort);
      return transaction.savedView.update({
        where: { id: current.id },
        data: {
          name,
          filters: input.body.filters === undefined ? undefined : toSavedViewJsonValue(normalizeSavedViewFilters(input.body.filters)),
          sort:
            nextSort === undefined
              ? undefined
              : nextSort === null
                ? Prisma.DbNull
                : toSavedViewJsonValue(nextSort),
          columns: input.body.columns === undefined ? undefined : toSavedViewJsonValue([...normalizeSavedViewColumns(input.body.columns)]),
          isDefault,
        },
      }) as Promise<SavedViewRecord>;
    });
  } catch (error) {
    if (isSavedViewUniqueError(error)) throw new TicketsError('SAVED_VIEW_NAME_TAKEN');
    throw error;
  }
}
