import { PrismaService } from '../../common/prisma/prisma.service';
import { loadFormVersionForService } from './load-form-version';
import { parseFormSchema } from './parse-form-schema';
import {
  recordServiceCatalogChange,
} from './record-service-catalog-change';
import {
  serviceFormsChangeLogEntityType,
  serviceFormsChangeLogReasons,
} from './service-forms.constants';
import { ServiceFormsError } from './service-forms.error';
import type { CatalogMutationContext } from './service-catalog.types';
import type {
  ServiceFormsConfiguration,
  TicketFormVersionBinding,
} from './service-forms.types';

export async function bindTicketFormVersionRef(
  prisma: PrismaService,
  input: {
    readonly serviceId: string;
    readonly formVersionRef: string | null | undefined;
  },
  configuration: ServiceFormsConfiguration,
  context: CatalogMutationContext,
): Promise<TicketFormVersionBinding> {
  const formVersionRef = input.formVersionRef?.trim() ?? '';
  if (formVersionRef.length === 0 && configuration.requireVersionOnTicket) {
    throw new ServiceFormsError('TICKET_FORM_VERSION_REQUIRED');
  }
  if (formVersionRef.length === 0) {
    throw new ServiceFormsError('TICKET_FORM_VERSION_REQUIRED');
  }
  const formVersion = await loadFormVersionForService(
    prisma,
    input.serviceId,
    formVersionRef,
  );
  const ticket = await prisma.$transaction(async (transaction) => {
    const created = await transaction.ticket.create({
      data: {
        ticketNumber: `FORM-${formVersion.id}-${Date.now()}`,
        title: 'Form version binding',
        description: 'Minimum ticket persistence for formVersionRef',
        priority: 'LOW',
        impact: 'LOW',
        urgency: 'LOW',
        originUnitId: 'form-binding-origin',
        serviceId: input.serviceId,
        formVersionId: formVersion.id,
        requesterId: 'form-binding-requester',
      },
    });
    await recordServiceCatalogChange(transaction as PrismaService, {
      entityType: serviceFormsChangeLogEntityType,
      entityId: formVersion.id,
      reason: serviceFormsChangeLogReasons.ticketFormVersionBind,
      diff: {
        ticketId: created.id,
        formVersionRef: formVersion.id,
        serviceId: input.serviceId,
      },
      actorUserId: context.actorUserId,
    });
    return created;
  });
  return {
    ticketId: ticket.id,
    serviceId: ticket.serviceId,
    formVersionRef: formVersion.id,
    schema: parseFormSchema(formVersion.schema),
  };
}
