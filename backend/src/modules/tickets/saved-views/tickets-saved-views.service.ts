import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { executeTicketOperation } from '../execute-ticket-operation';
import type { TicketMutationContext } from '../tickets.types';
import { createSavedView } from './create-saved-view';
import { deleteSavedView } from './delete-saved-view';
import { listSavedViews } from './list-saved-views';
import type {
  CreateSavedViewInput,
  SavedViewResponse,
  UpdateSavedViewInput,
} from './saved-views.types';
import { TicketSavedViewsConfigurationLoader } from './ticket-saved-views-configuration.loader';
import { toSavedViewResponse } from './to-saved-view-response';
import { updateSavedView } from './update-saved-view';

@Injectable()
export class TicketsSavedViewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationLoader: TicketSavedViewsConfigurationLoader,
  ) {}

  list(context: TicketMutationContext): Promise<readonly SavedViewResponse[]> {
    return executeTicketOperation(async () => {
      const records = await listSavedViews({
        prisma: this.prisma,
        context,
        configuration: await this.configurationLoader.load(),
      });
      return records.map(toSavedViewResponse);
    });
  }

  create(
    body: CreateSavedViewInput,
    context: TicketMutationContext,
  ): Promise<SavedViewResponse> {
    return executeTicketOperation(async () =>
      toSavedViewResponse(
        await createSavedView({
          prisma: this.prisma,
          body,
          context,
          configuration: await this.configurationLoader.load(),
        }),
      ),
    );
  }

  update(
    savedViewId: string,
    body: UpdateSavedViewInput,
    context: TicketMutationContext,
  ): Promise<SavedViewResponse> {
    return executeTicketOperation(async () =>
      toSavedViewResponse(
        await updateSavedView({
          prisma: this.prisma,
          savedViewId,
          body,
          context,
          configuration: await this.configurationLoader.load(),
        }),
      ),
    );
  }

  remove(savedViewId: string, context: TicketMutationContext): Promise<void> {
    return executeTicketOperation(async () => {
      await deleteSavedView({
        prisma: this.prisma,
        savedViewId,
        context,
        configuration: await this.configurationLoader.load(),
      });
    });
  }
}
